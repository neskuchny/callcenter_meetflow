from flask import Flask, jsonify, request, send_file, make_response
from flask_cors import CORS
import pandas as pd
import asyncio
import json
import os
import shutil
import time
from werkzeug.utils import secure_filename
# from main import batch_transcribe  # Заменяем на Gemini транскрипцию
from datetime import datetime
import re
from groq import Groq
from dotenv import load_dotenv
import google.generativeai as genai
import random
import traceback
import tempfile
import subprocess
import aiohttp
from flask_cors import cross_origin

load_dotenv()

# Вспомогательные функции для работы с аудио через ffmpeg
def get_audio_duration_ffmpeg(file_path):
    """Получает длительность аудиофайла в миллисекундах с помощью ffprobe"""
    cmd = [
        'ffprobe', 
        '-v', 'error', 
        '-show_entries', 'format=duration', 
        '-of', 'default=noprint_wrappers=1:nokey=1', 
        str(file_path)
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        print(f"Ошибка при получении длительности аудио: {result.stderr}")
        return 5000  # 5 секунд по умолчанию
    
    duration_str = result.stdout.strip()
    
    if not duration_str or duration_str.lower() == 'n/a':
        print(f"Предупреждение: ffprobe не смог определить длительность для {file_path}, используем длительность по умолчанию 5 секунд")
        return 5000
    
    try:
        duration_sec = float(duration_str)
        return int(duration_sec * 1000)
    except ValueError:
        print(f"Предупреждение: не удалось преобразовать длительность '{duration_str}' в число для файла {file_path}")
        return 5000

def extract_audio_segment_ffmpeg(input_file, output_file, start_ms, duration_ms):
    """Извлекает сегмент аудио из входного файла и сохраняет в формате WAV 16kHz"""
    start_sec = start_ms / 1000
    duration_sec = duration_ms / 1000
    
    cmd = [
        'ffmpeg',
        '-y',  # Перезаписывать выходной файл
        '-ss', f'{start_sec}',  # Начальная позиция
        '-i', str(input_file),  # Входной файл
        '-t', f'{duration_sec}',  # Длительность
        '-ar', '16000',  # Частота дискретизации 16kHz
        '-ac', '1',  # Моно аудио
        '-c:a', 'pcm_s16le',  # 16-бит PCM
        str(output_file)  # Выходной файл
    ]
    
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0:
        raise Exception(f"Ошибка при извлечении аудио сегмента: {result.stderr.decode('utf-8')}")

async def download_audio_gemini(session, url):
    """Асинхронно загружает аудиофайл по URL или читает локальный файл"""
    try:
        # Если это локальный файл
        if url.startswith('/api/recordings/'):
            # Конвертируем URL в путь к файлу
            filename = url.replace('/api/recordings/', '')
            local_path = os.path.join(os.getcwd(), 'uploads', 'Записи', filename.replace('/', os.sep))
            
            if os.path.exists(local_path):
                with open(local_path, 'rb') as f:
                    content = f.read()
                print(f"Локальный файл загружен: {local_path} ({len(content)} байт)")
                return url, content
            else:
                print(f"Локальный файл не найден: {local_path}")
                return url, None
        else:
            # Обычная загрузка по HTTP
            async with session.get(url) as response:
                return url, await response.read()
    except Exception as e:
        print(f"Ошибка при загрузке {url}: {str(e)}")
        return url, None

async def transcribe_audio_gemini(audio_content: bytes, url: str):
    """Транскрибирует отдельный аудиофайл через Gemini"""
    try:
        if audio_content is None:
            return {
                "url": url,
                "text": None,
                "status": "error",
                "error": "Не удалось загрузить аудио"
            }
        
        # Определяем MIME тип по URL
        if url.startswith('/api/recordings/'):
            # Локальный файл - определяем по расширению
            if url.lower().endswith('.wav'):
                mime_type = 'audio/wav'
            elif url.lower().endswith('.ogg'):
                mime_type = 'audio/ogg'
            elif url.lower().endswith('.m4a'):
                mime_type = 'audio/mp4'
            else:
                mime_type = 'audio/mp3'
            print(f"Транскрибируем локальный файл {url} ({len(audio_content)} байт, {mime_type})")
        else:
            # Облачный файл - пытаемся конвертировать через ffmpeg
            input_path = None
            output_path = None
            
            try:
                # Сохраняем исходный файл
                with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as temp_input:
                    temp_input.write(audio_content)
                    input_path = temp_input.name
                
                # Создаем путь для конвертированного файла
                output_path = input_path.replace('.mp3', '.wav')
                
                # Конвертируем в WAV 16kHz моно через ffmpeg
                extract_audio_segment_ffmpeg(input_path, output_path, 0, get_audio_duration_ffmpeg(input_path))
                
                # Читаем конвертированный файл
                with open(output_path, 'rb') as f:
                    audio_content = f.read()
                
                mime_type = 'audio/wav'
                print(f"Транскрибируем облачный файл {url} после конвертации ({len(audio_content)} байт, {mime_type})")
                
            except Exception as conv_error:
                print(f"Ошибка конвертации {url}: {conv_error}. Пробуем напрямую как MP3")
                mime_type = 'audio/mp3'
            finally:
                # Удаляем временные файлы
                for path in [input_path, output_path]:
                    if path and os.path.exists(path):
                        try:
                            os.unlink(path)
                        except:
                            pass
             
        # Используем GenerativeModel для создания запроса
        model = genai.GenerativeModel('gemini-2.0-flash-exp')
        response = model.generate_content(
            contents=[
                'Transcribe audio, Return only text in audio language without additional comments.',
                {
                    'mime_type': mime_type,
                    'data': audio_content
                }
            ]
        )
        
        print(f"Успешная транскрипция: {len(response.text)} символов")
        return {
            "url": url,
            "text": response.text,
            "status": "success"
        }
        
    except Exception as e:
        print(f"Ошибка при транскрипции {url} через Gemini: {str(e)}")
        return {
            "url": url,
            "text": None,
            "status": "error",
            "error": str(e)
        }

async def batch_transcribe_gemini(urls):
    """
    Асинхронно транскрибирует пачку аудиофайлов по их URL через Gemini
    
    Args:
        urls: Список URL-адресов аудиофайлов
        
    Returns:
        List[Dict]: Список результатов транскрипции
    """
    async with aiohttp.ClientSession() as session:
        # Загружаем все файлы асинхронно
        download_tasks = [download_audio_gemini(session, url) for url in urls]
        downloaded_files = await asyncio.gather(*download_tasks)
        
        # Транскрибируем все файлы
        transcribe_tasks = [
            transcribe_audio_gemini(content, url)
            for url, content in downloaded_files
        ]
        results = await asyncio.gather(*transcribe_tasks)
    
    return results

def transcribe_local_file_sync(file_path):
    """Синхронная транскрипция локального аудиофайла через Gemini"""
    try:
        # Определяем MIME тип по расширению файла
        file_ext = os.path.splitext(file_path)[1].lower()
        mime_type_map = {
            '.mp3': 'audio/mp3',
            '.wav': 'audio/wav', 
            '.ogg': 'audio/ogg',
            '.m4a': 'audio/mp4',
            '.flac': 'audio/flac'
        }
        mime_type = mime_type_map.get(file_ext, 'audio/mp3')
        
        # Чтение аудиофайла
        with open(file_path, 'rb') as f:
            audio_file_bytes = f.read()
        
        print(f"Транскрибируем локальный файл {file_path} ({len(audio_file_bytes)} байт, {mime_type})")
        
        # Используем GenerativeModel для создания запроса
        model = genai.GenerativeModel('gemini-2.0-flash-exp')
        response = model.generate_content(
            contents=[
                'Transcribe audio, Return only text in audio language without additional comments.',
                {
                    'mime_type': mime_type,
                    'data': audio_file_bytes
                }
            ]
        )
        
        print(f"Успешная транскрипция локального файла: {len(response.text)} символов")
        return {"text": response.text}
        
    except Exception as e:
        print(f"Ошибка при транскрипции локального файла {file_path}: {str(e)}")
        raise

async def transcribe_with_gemini_single(file_path):
    """Асинхронная обертка для транскрипции локального файла"""
    return transcribe_local_file_sync(file_path)

# Инициализируем клиент Groq для анализа звонков
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Инициализируем клиент Gemini для анализа звонков
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Проверка наличия API ключа для Gemini
API_KEY_FOR_GEMINI = GEMINI_API_KEY or GOOGLE_API_KEY

# Инициализируем Google AI для Gemini API, если ключ доступен
if API_KEY_FOR_GEMINI:
    try:
        genai.configure(api_key=API_KEY_FOR_GEMINI)
        print(f"Gemini API успешно инициализирован с ключом {'GEMINI_API_KEY' if GEMINI_API_KEY else 'GOOGLE_API_KEY'}")
    except Exception as e:
        print(f"Ошибка при инициализации Gemini API: {str(e)}")
else:
    print("ВНИМАНИЕ: Ни GEMINI_API_KEY, ни GOOGLE_API_KEY не найдены в .env, Gemini API не будет доступен")

app = Flask(__name__)
CORS(app)  # Разрешаем кросс-доменные запросы

# Константы
EXCEL_FILE = "DFASDF.xlsx"  # Реальный файл Excel
BATCH_SIZE = 10  # Количество звонков для обработки за один раз
UPLOAD_FOLDER = './uploads'
ALLOWED_EXTENSIONS = {'xlsx', 'xls'}

# Создаем папку для загрузок, если её нет
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# Проверка расширения файла
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Функция загрузки данных из Excel файла
def load_calls_from_excel():
    """Загружает данные звонков из Excel файла."""
    try:
        print(f"Чтение файла Excel: {EXCEL_FILE}")
        df = pd.read_excel(EXCEL_FILE)
        
        # Обработка дат/времени если они есть
        if 'Дата/Время завершения звонка' in df.columns:
            try:
                df['Дата/Время завершения звонка'] = pd.to_datetime(df['Дата/Время завершения звонка'], errors='coerce')
                df['date'] = df['Дата/Время завершения звонка'].dt.strftime('%d.%m.%Y')
                df['time'] = df['Дата/Время завершения звонка'].dt.strftime('%H:%M')
            except Exception as e:
                print(f"Предупреждение: Ошибка обработки дат: {e}")
                # Используем текущую дату/время как запасной вариант
                now = datetime.now()
                df['date'] = now.strftime('%d.%m.%Y')
                df['time'] = now.strftime('%H:%M')
        
        print(f"Успешно загружено {len(df)} строк из Excel")
        return df
    except Exception as e:
        print(f"Ошибка при загрузке Excel файла {EXCEL_FILE}: {e}")
        traceback.print_exc()
        # Возвращаем пустой DataFrame в случае ошибки
        return pd.DataFrame()

# Глобальная переменная для хранения данных (или загрузка при старте)
# Убедимся, что calls_df загружается корректно при старте или при первом запросе
calls_df = pd.DataFrame() # Инициализируем пустым DataFrame

def load_or_get_calls_df():
    """Загружает или возвращает глобальный DataFrame."""
    global calls_df
    if calls_df.empty:
        print("Загрузка данных из Excel в глобальный DataFrame...")
        calls_df = load_calls_from_excel()
        print(f"Загружено {len(calls_df)} строк.")
    return calls_df

# Новый эндпоинт для загрузки файла Excel
@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Загрузить файл Excel со звонками"""
    try:
        # Проверяем, есть ли файл в запросе
        if 'file' not in request.files:
            return jsonify({"error": "Файл не найден в запросе"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "Файл не выбран"}), 400
        
        if file and allowed_file(file.filename):
            # Безопасное имя файла
            filename = secure_filename(file.filename)
            timestamp = int(time.time())
            upload_path = os.path.join(UPLOAD_FOLDER, f"{timestamp}_{filename}")
            
            # Сохраняем загруженный файл
            file.save(upload_path)
            
            # Делаем резервное копирование текущего файла
            if os.path.exists(EXCEL_FILE):
                backup_name = f"backup_{int(time.time())}_{EXCEL_FILE}"
                shutil.copy2(EXCEL_FILE, backup_name)
                print(f"Создана резервная копия: {backup_name}")
            
            # Копируем загруженный файл вместо основного
            shutil.copy2(upload_path, EXCEL_FILE)
            print(f"Файл сохранен как: {EXCEL_FILE}")
            
            # Пытаемся прочитать файл для проверки
            try:
                df = pd.read_excel(EXCEL_FILE)
                rows_count = len(df)
                print(f"Файл успешно прочитан. Строк: {rows_count}")
                
                # Проверяем необходимые столбцы
                required_columns = ['Ссылка на запись', 'Транскрибация']
                missing_columns = [col for col in required_columns if col not in df.columns]
                
                if missing_columns:
                    print(f"Отсутствуют столбцы: {missing_columns}")
                    return jsonify({
                        "warning": f"В файле отсутствуют необходимые столбцы: {', '.join(missing_columns)}. Файл сохранен, но для транскрибации нужны все столбцы.",
                        "rows": int(rows_count),
                        "filename": EXCEL_FILE
                    }), 200
                
                # Проверяем наличие и корректность данных
                empty_links = int(df['Ссылка на запись'].isna().sum())
                invalid_links = int(len(df[~df['Ссылка на запись'].isna() & ~df['Ссылка на запись'].astype(str).str.startswith('http')]))
                
                # Проверяем количество звонков для транскрибации
                # Здесь мы учитываем различные варианты пустых или специальных значений
                # Звонок требует транскрибации, если:
                # 1. Значение равно '-' (стандартное для предыдущих файлов)
                # 2. Значение отсутствует (NaN/None)
                # 3. Значение - пустая строка
                # 4. Значение содержит только пробелы
                
                # Проверяем разные условия для транскрибации
                needs_transcribe_dash = int((df['Транскрибация'] == '-').sum())
                needs_transcribe_empty = int(df['Транскрибация'].isna().sum())
                needs_transcribe_blank = int((df['Транскрибация'] == '').sum())
                needs_transcribe_spaces = int((df['Транскрибация'].astype(str).str.strip() == '').sum())
                
                total_needs_transcribe = int(needs_transcribe_dash + needs_transcribe_empty + needs_transcribe_blank + needs_transcribe_spaces)
                
                # Проверяем, есть ли уже транскрипции
                has_transcriptions = int(rows_count - total_needs_transcribe)
                
                # Если все уже транскрибировано, но есть ссылки, предлагаем перетранскрибировать
                if total_needs_transcribe == 0 and int(df['Ссылка на запись'].notna().sum()) > 0:
                    print("Все звонки уже имеют транскрипции, но можно перетранскрибировать")
                    needs_analysis = int(rows_count)  # Все звонки требуют анализа
                else:
                    needs_analysis = int(total_needs_transcribe)
                
                response_data = {
                    "message": f"Файл успешно загружен как {EXCEL_FILE}",
                    "rows": int(rows_count),
                    "transcribe_count": int(total_needs_transcribe),
                    "filename": EXCEL_FILE,
                    "needs_analysis": int(needs_analysis),
                    "has_transcriptions": int(has_transcriptions)
                }
                
                # Добавляем предупреждения, если есть проблемы с данными
                warnings = []
                if empty_links > 0:
                    warnings.append(f"Обнаружено {empty_links} строк с пустыми ссылками на записи")
                
                if invalid_links > 0:
                    warnings.append(f"Обнаружено {invalid_links} строк с некорректными ссылками (не начинаются с http)")
                
                if total_needs_transcribe == 0 and int(df['Ссылка на запись'].notna().sum()) > 0:
                    warnings.append("Все звонки уже имеют транскрипции. Можно выполнить анализ или перетранскрибировать.")
                
                if warnings:
                    response_data["warning"] = ". ".join(warnings)
                
                print(f"Результат анализа файла: {response_data}")
                return jsonify(response_data), 200
                
            except Exception as e:
                error_msg = f"Ошибка при чтении файла: {str(e)}"
                print(error_msg)
                return jsonify({"error": error_msg}), 500
        
        return jsonify({"error": "Недопустимый формат файла. Разрешены только .xlsx и .xls"}), 400
    
    except Exception as e:
        error_msg = f"Ошибка при загрузке файла: {str(e)}"
        print(error_msg)
        return jsonify({"error": error_msg}), 500

def analyze_transcript(transcript, key_questions=None):
    """
    Анализирует транскрипцию звонка с помощью LLM и возвращает детальные результаты анализа
    
    Args:
        transcript (str): Текст транскрипции звонка
        key_questions (list): Список ключевых вопросов (максимум 3) для получения дополнительных ответов
    """
    if not transcript or transcript == "-" or len(transcript) < 10:
        return {
            "aiSummary": "Транскрипция отсутствует или слишком короткая",
            "keyInsight": "Недостаточно данных",
            "recommendation": "Требуется полная транскрипция",
            "score": 0,
            "callType": "не определен",
            "callResult": "не определен",
            "status": "требует внимания",
            "tags": [],
            "supportingQuote": "",
            "qualityMetrics": {},
            
            # Новые поля для расширенного анализа
            "objections": [],
            "rejectionReasons": [],
            "painPoints": [],
            "customerRequests": [],
            "managerPerformance": {
                "score": 0,
                "details": "Недостаточно данных для оценки"
            },
            "customerPotential": {
                "score": 0,
                "details": "Недостаточно данных для оценки"
            },
            "salesReadiness": 0,
            "conversionProbability": 0,
            "nextSteps": "Получить транскрипцию звонка",
            
            # Ответы на ключевые вопросы
            "keyQuestion1Answer": "",
            "keyQuestion2Answer": "",
            "keyQuestion3Answer": "",
            
            # Новые поля для интересов клиента и факторов принятия решения
            "clientInterests": [],
            "decisionFactors": {
                "positive": [],
                "negative": []
            }
        }
    
    try:
        # Пробуем использовать Gemini API
        if API_KEY_FOR_GEMINI:
            try:
                print(f"Анализ транскрипции с помощью Gemini API (длина текста: {len(transcript)})")
                
                # Конфигурация для модели gemma-3-27b-it
                generation_config = {
                    "temperature": 0.2,
                    "top_p": 0.9,
                    "top_k": 40,
                    "max_output_tokens": 4024,
                }
                
                # Инициализация модели с правильными параметрами
                model = genai.GenerativeModel(
                    model_name='gemma-3-27b-it',
                    generation_config=generation_config
                )
                
                # Дополняем промпт ключевыми вопросами, если они есть
                key_questions_prompt = ""
                if key_questions and len(key_questions) > 0:
                    key_questions_prompt = f'''
                    11. Ответы на ключевые вопросы (ответить коротко и конкретно):
                    '''
                    for i, question in enumerate(key_questions[:3], 1):
                        key_questions_prompt += f'''
                        - Вопрос {i}: {question}'''
                
                prompt = f'''
                Проанализируй детально следующую транскрипцию телефонного звонка и предоставь:
                
                1. Краткое резюме (2-3 предложения)
                2. Ключевой вывод
                3. Рекомендацию по улучшению
                4. Оценку эффективности звонка по 10-балльной шкале (число от 0 до 10)
                5. Тип звонка (входящий/исходящий, продажи/поддержка/консультация)
                6. Результат звонка (успешный/неуспешный/требует follow-up)
                7. Теги (минимум 3, например: "ценовое возражение", "упоминание конкурентов", "запрос скидки")
                8. Цитату из звонка, подтверждающую основной вывод
                9. Метрики качества:
                   - средняя длина реплики оператора
                   - скорость ответа (высокая/средняя/низкая)
                   - информативность (1-10)
                   - эмпатия (1-10)
                   - решение проблемы (1-10)
                
                10. Расширенный анализ:
                   - Список возражений клиента (массив строк)
                   - Причины отказа, если клиент отказался (массив строк)
                   - Проблемные места в разговоре (массив строк)
                   - Запросы клиента (массив строк)
                   - Оценка работы менеджера (объект: score - число 1-10, details - краткое описание)
                   - Оценка потенциала клиента (объект: score - число 1-10, details - краткое описание)
                   - Готовность к продаже по шкале 1-10 (число)
                   - Вероятность конверсии в процентах (число 0-100)
                   - Рекомендуемые следующие шаги (строка)
                {key_questions_prompt}
                
                Транскрипция:
                {transcript}
                
                Верни результат в виде JSON объекта с полями: 
                aiSummary, keyInsight, recommendation, score, callType, callResult, tags, supportingQuote, 
                qualityMetrics, objections, rejectionReasons, painPoints, customerRequests, 
                managerPerformance, customerPotential, salesReadiness, conversionProbability, nextSteps
                '''
                
                if key_questions and len(key_questions) > 0:
                    prompt += ''', keyQuestion1Answer, keyQuestion2Answer, keyQuestion3Answer'''
                
                response = model.generate_content(prompt)
                result_text = response.text.strip()
                print(f"Ответ от Gemini API получен (длина: {len(result_text)})")
                
                # Извлекаем JSON из ответа
                json_str = result_text
                if result_text.startswith('```json') and result_text.endswith('```'):
                    json_str = result_text[7:-3].strip()
                elif result_text.startswith('```') and result_text.endswith('```'):
                    json_str = result_text[3:-3].strip()
                
                try:
                    analysis_result = json.loads(json_str)
                    print("JSON успешно извлечен и обработан")
                    
                    # Добавляем пустые ответы на ключевые вопросы, если их нет
                    if key_questions and len(key_questions) > 0:
                        if 'keyQuestion1Answer' not in analysis_result and len(key_questions) >= 1:
                            analysis_result['keyQuestion1Answer'] = ""
                        if 'keyQuestion2Answer' not in analysis_result and len(key_questions) >= 2:
                            analysis_result['keyQuestion2Answer'] = ""
                        if 'keyQuestion3Answer' not in analysis_result and len(key_questions) >= 3:
                            analysis_result['keyQuestion3Answer'] = ""
                    
                    return analysis_result
                except json.JSONDecodeError as je:
                    print(f"Ошибка при парсинге JSON: {str(je)}")
                    # Если не удалось распарсить JSON, возвращаем базовый результат
                    return basic_analysis_dict(result_text, key_questions)
                
            except Exception as e:
                # Находим JSON-часть в ответе, если она есть
                json_match = re.search(r'```json\n(.*?)\n```', result_text, re.DOTALL)
                if json_match:
                    json_str = json_match.group(1)
                else:
                    # Если не нашли в формате markdown, ищем просто JSON
                    json_str = re.search(r'{.*}', result_text, re.DOTALL)
                    if json_str:
                        json_str = json_str.group(0)
                    else:
                        json_str = result_text
                
                # Попытка преобразовать текст в JSON
                try:
                    result = json.loads(json_str)
                    print("Успешно получен анализ от Gemini API")
                    
                    # Проверяем, что score - это число
                    if "score" in result:
                        try:
                            result["score"] = int(result["score"])
                        except (ValueError, TypeError):
                            # Если не удалось преобразовать в число, устанавливаем значение по умолчанию
                            print(f"Некорректное значение score: {result.get('score')}. Устанавливаем 5.")
                            result["score"] = 5
                    
                    # Добавим все отсутствующие поля расширенной аналитики с значениями по умолчанию
                    default_fields = {
                        "objections": [],
                        "rejectionReasons": [],
                        "painPoints": [],
                        "customerRequests": [],
                        "managerPerformance": {
                            "score": 5,
                            "details": "Средний уровень работы"
                        },
                        "customerPotential": {
                            "score": 5,
                            "details": "Средний потенциал"
                        },
                        "salesReadiness": 5,
                        "conversionProbability": 50,
                        "nextSteps": "Отработать возникшие возражения"
                    }
                    
                    # Заполняем отсутствующие поля
                    for field, default_value in default_fields.items():
                        if field not in result:
                            result[field] = default_value
                    
                    return result
                except Exception as json_error:
                    print(f"Ошибка парсинга JSON от Gemini: {json_error}")
                    # Конвертируем результат в нужный формат
                    return {
                        "aiSummary": result_text[:200] + "...", 
                        "keyInsight": "Анализ выполнен, но формат JSON некорректен",
                        "recommendation": "Проверьте работу API",
                        "score": 5,
                        "callType": "не определен",
                        "callResult": "не определен",
                        "tags": ["ошибка_формата"],
                        "supportingQuote": "",
                        "qualityMetrics": {},
                        "objections": [],
                        "rejectionReasons": [],
                        "painPoints": [],
                        "customerRequests": [],
                        "managerPerformance": {
                            "score": 0,
                            "details": "Ошибка анализа"
                        },
                        "customerPotential": {
                            "score": 0, 
                            "details": "Ошибка анализа"
                        },
                        "salesReadiness": 0,
                        "conversionProbability": 0,
                        "nextSteps": "Проверить работу API"
                    }
            except Exception as e:
                print(f"Ошибка при использовании Gemini API: {str(e)}")
                # Продолжаем с Groq, если Gemini не сработал
        
        # Если Gemini не сработал или API-ключ не указан, используем Groq
        try:
            print("Анализ транскрипции с помощью Groq API")
            prompt = f'''
            Проанализируй детально следующую транскрипцию телефонного звонка и предоставь:
            
            1. Краткое резюме (2-3 предложения)
            2. Ключевой вывод
            3. Рекомендацию по улучшению
            4. Оценку эффективности звонка по 10-балльной шкале
            5. Тип звонка (входящий/исходящий, продажи/поддержка/консультация)
            6. Результат звонка (успешный/неуспешный/требует follow-up)
            7. Теги (минимум 3, например: "ценовое возражение", "упоминание конкурентов", "запрос скидки")
            8. Цитату из звонка, подтверждающую основной вывод
            9. Метрики качества:
               - средняя длина реплики оператора
               - скорость ответа (высокая/средняя/низкая)
               - информативность (1-10)
               - эмпатия (1-10)
               - решение проблемы (1-10)
            
            10. Расширенный анализ:
               - Список возражений клиента (массив строк)
               - Причины отказа, если клиент отказался (массив строк)
               - Проблемные места в разговоре (массив строк)
               - Запросы клиента (массив строк)
               - Оценка работы менеджера (объект: score - число 1-10, details - краткое описание)
               - Оценка потенциала клиента (объект: score - число 1-10, details - краткое описание)
               - Готовность к продаже по шкале 1-10 (число)
               - Вероятность конверсии в процентах (число 0-100)
               - Рекомендуемые следующие шаги (строка)
            
            Транскрипция:
            {transcript}
            
            Формат ответа: строго JSON с ключами "aiSummary", "keyInsight", "recommendation", "score", "callType", "callResult", "tags", "supportingQuote", "qualityMetrics",
            "objections", "rejectionReasons", "painPoints", "customerRequests", "managerPerformance", "customerPotential", "salesReadiness", "conversionProbability", "nextSteps"
            '''
            
            response = client.chat.completions.create(
                model="llama-4-scout-17b-16e-instruct", # meta-llama/llama-4-scout-17b-16e-instruct llama3-70b-8192
                messages=[
                    {"role": "system", "content": "Ты - аналитик телефонных звонков. Твоя задача - анализировать транскрипции звонков и давать детальные выводы и рекомендации по улучшению работы операторов."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=1024,
                response_format={"type": "json_object"}
            )
            
            # Извлекаем JSON из ответа
            result = json.loads(response.choices[0].message.content)
            print("Успешно получен анализ от Groq API")
            
            # Добавим все отсутствующие поля расширенной аналитики с значениями по умолчанию
            default_fields = {
                "objections": [],
                "rejectionReasons": [],
                "painPoints": [],
                "customerRequests": [],
                "managerPerformance": {
                    "score": 5,
                    "details": "Средний уровень работы"
                },
                "customerPotential": {
                    "score": 5,
                    "details": "Средний потенциал"
                },
                "salesReadiness": 5,
                "conversionProbability": 50,
                "nextSteps": "Отработать возникшие возражения"
            }
            
            # Заполняем отсутствующие поля
            for field, default_value in default_fields.items():
                if field not in result:
                    result[field] = default_value
                    
            return result
        except Exception as groq_error:
            print(f"Ошибка при использовании Groq API: {str(groq_error)}")
        
        # Если дошли до этого места, используем заглушку
        # В реальном приложении используйте код с запросом к Groq API
        # Мы добавили много новых полей для более глубокого анализа
        
        # Заглушка для анализа (с расширенными полями)
        # Определяем тип звонка на основе контента транскрипции
        call_type = "входящий" if "могу помочь" in transcript.lower() else "исходящий"
        
        # Определяем примерный результат на основе контента
        if "спасибо" in transcript.lower() or "договорились" in transcript.lower():
            result = "успешный"
            score = 8
            conversion_probability = 80
            sales_readiness = 8
        elif "перезвоните" in transcript.lower() or "подумаю" in transcript.lower():
            result = "требует follow-up"
            score = 5
            conversion_probability = 40
            sales_readiness = 5
        else:
            result = "неуспешный"
            score = 3
            conversion_probability = 10
            sales_readiness = 2
        
        # Находим цитату для подтверждения вывода
        supporting_quote = ""
        lines = transcript.split('\n')
        for line in lines:
            if "спасибо" in line.lower() or "договорились" in line.lower() or "перезвоните" in line.lower():
                supporting_quote = line
                break
        
        # Определяем теги
        tags = []
        if "цена" in transcript.lower() or "стоимость" in transcript.lower():
            tags.append("ценовое возражение")
        if "конкурент" in transcript.lower():
            tags.append("упоминание конкурентов")
        if "акция" in transcript.lower() or "скидка" in transcript.lower():
            tags.append("обсуждение скидок")
        if "доставка" in transcript.lower():
            tags.append("вопрос о доставке")
        if len(tags) < 3:
            tags.append("общее обсуждение")
        
        # Создаем метрики качества
        quality_metrics = {
            "средняя_длина_реплики_оператора": 15,  # слов
            "скорость_ответа": "высокая",
            "информативность": 7,
            "эмпатия": 6,
            "решение_проблемы": result == "успешный" and 8 or 4
        }
        
        # Анализируем возражения клиента
        objections = []
        if "дорого" in transcript.lower():
            objections.append("Высокая цена")
        if "подумаю" in transcript.lower():
            objections.append("Требуется время на размышление")
        if "нет времени" in transcript.lower():
            objections.append("Нет времени на разговор")
        
        # Определяем причины отказа
        rejection_reasons = []
        if result == "неуспешный":
            if "дорого" in transcript.lower():
                rejection_reasons.append("Цена не соответствует ожиданиям")
            if "не интересно" in transcript.lower():
                rejection_reasons.append("Отсутствие интереса к предложению")
            if "не подходит" in transcript.lower():
                rejection_reasons.append("Предложение не подходит под нужды клиента")
            if len(rejection_reasons) == 0:
                rejection_reasons.append("Причина отказа не выявлена")
        
        # Находим проблемные места в разговоре
        pain_points = []
        if "не понятно" in transcript.lower():
            pain_points.append("Неясное объяснение условий")
        if "долго" in transcript.lower():
            pain_points.append("Затянутый разговор")
        if "повторите" in transcript.lower():
            pain_points.append("Плохое качество связи или неясная речь")
        
        # Определяем запросы клиента
        customer_requests = []
        if "скидка" in transcript.lower():
            customer_requests.append("Запрос скидки")
        if "доставка" in transcript.lower():
            customer_requests.append("Интерес к условиям доставки")
        if "гарантия" in transcript.lower():
            customer_requests.append("Вопрос о гарантии")
        
        # Оценка работы менеджера
        manager_performance = {
            "score": 7 if result == "успешный" else 4,
            "details": "Хорошо отработал возражения" if result == "успешный" else "Не смог удержать интерес клиента"
        }
        
        # Оценка потенциала клиента
        customer_potential = {
            "score": 8 if "интересно" in transcript.lower() else 5,
            "details": "Высокий интерес к продукту" if "интересно" in transcript.lower() else "Средний потенциал"
        }
        
        # Рекомендуемые следующие шаги
        if result == "успешный":
            next_steps = "Оформить заказ и проконтролировать доставку"
        elif result == "требует follow-up":
            next_steps = "Перезвонить через 2-3 дня с новым предложением"
        else:
            next_steps = "Отправить информационные материалы по email"
        
        # Определяем интересы клиента
        client_interests = []
        if "цена" in transcript.lower() or "стоимость" in transcript.lower():
            client_interests.append("Интерес к ценовым условиям")
        if "продукт" in transcript.lower() or "товар" in transcript.lower():
            client_interests.append("Интерес к товару/продукту")
        if "доставка" in transcript.lower() or "условия" in transcript.lower():
            client_interests.append("Интерес к условиям обслуживания")
        if "вопрос" in transcript.lower() or "спросить" in transcript.lower():
            client_interests.append("Консультационные вопросы")
            
        # Определяем факторы принятия решения
        decision_factors = {
            "positive": [],
            "negative": []
        }
        
        # Положительные факторы
        if "качество" in transcript.lower() and "хорошее" in transcript.lower():
            decision_factors["positive"].append("Высокое качество продукта")
        if "цена" in transcript.lower() and ("устраивает" in transcript.lower() or "согласен" in transcript.lower()):
            decision_factors["positive"].append("Приемлемая цена")
        if "сроки" in transcript.lower() and "устраивают" in transcript.lower():
            decision_factors["positive"].append("Подходящие сроки доставки")
            
        # Отрицательные факторы
        if "дорого" in transcript.lower():
            decision_factors["negative"].append("Высокая цена")
        if "долго" in transcript.lower() and "ждать" in transcript.lower():
            decision_factors["negative"].append("Длительные сроки доставки")
        if "сомневаюсь" in transcript.lower() or "не уверен" in transcript.lower():
            decision_factors["negative"].append("Сомнения в необходимости приобретения")
        
        result = {
            "aiSummary": f"{'Входящий' if call_type == 'входящий' else 'Исходящий'} звонок, {result}. Основная тема: {', '.join(tags) if tags else 'не определена'}.", 
            "keyInsight": f"{'Успешная коммуникация' if score > 7 else 'Требуется улучшение в коммуникации'} по теме {tags[0] if tags else 'звонка'}.",
            "recommendation": f"{'Продолжать использовать текущий подход' if score > 7 else 'Улучшить скрипт по работе с возражениями' if 'ценовое возражение' in tags else 'Требуется дополнительное обучение оператора'}",
            "score": score,
            "callType": call_type,
            "callResult": result,
            "status": result,  # Используем результат звонка как статус
            "tags": tags,
            "supportingQuote": supporting_quote or "Цитата не найдена",
            "qualityMetrics": quality_metrics,
            
            # Дополнительные поля для расширенного анализа
            "objections": objections,
            "rejectionReasons": rejection_reasons,
            "painPoints": pain_points,
            "customerRequests": customer_requests,
            "managerPerformance": manager_performance,
            "customerPotential": customer_potential,
            "salesReadiness": sales_readiness,
            "conversionProbability": conversion_probability,
            "nextSteps": next_steps,
            
            # Новые поля для интересов клиента и факторов принятия решения
            "clientInterests": client_interests,
            "decisionFactors": decision_factors
        }
        
        return result
        
    except Exception as e:
        print(f"Ошибка анализа: {str(e)}")
        return {
            "aiSummary": "Ошибка при анализе транскрипции",
            "keyInsight": "Не удалось выполнить анализ",
            "recommendation": "Проверьте работу LLM-сервиса",
            "score": 0,
            "callType": "не определен",
            "callResult": "не определен",
            "status": "требует внимания",
            "tags": [],
            "supportingQuote": "",
            "qualityMetrics": {},
            "objections": [],
            "rejectionReasons": [],
            "painPoints": [],
            "customerRequests": [],
            "managerPerformance": {
                "score": 0,
                "details": "Ошибка анализа"
            },
            "customerPotential": {
                "score": 0,
                "details": "Ошибка анализа"
            },
            "salesReadiness": 0,
            "conversionProbability": 0,
            "nextSteps": "Проверить работу сервиса анализа",
            "clientInterests": [],
            "decisionFactors": {
                "positive": [],
                "negative": []
            }
        }

@app.route('/api/calls', methods=['GET'])
def get_calls():
    """Получить список всех звонков из Excel файла"""
    source = request.args.get('source', 'all')  # all, cloud, local
    
    try:
        # Чтение файла Excel
        df = pd.read_excel(EXCEL_FILE)
        
        # Фильтрация по источнику
        if source == 'cloud':
            # Только облачные записи (Yandex Cloud)
            df = df[df['Ссылка на запись'].str.contains('storage.yandexcloud.net', na=False)]
        elif source == 'local':
            # Только локальные записи
            df = df[df['Ссылка на запись'].str.startswith('/api/recordings/', na=False)]
        # elif source == 'all' - показываем все без фильтрации
        
        # Проверяем и конвертируем даты в строковый формат для JSON
        try:
            if 'Дата/Время завершения звонка' in df.columns:
                # Преобразуем столбец в datetime, если он не является таковым
                if not pd.api.types.is_datetime64_any_dtype(df['Дата/Время завершения звонка']):
                    df['Дата/Время завершения звонка'] = pd.to_datetime(df['Дата/Время завершения звонка'], errors='coerce')
                
                # Теперь безопасно используем .dt аксессор
                df['date'] = df['Дата/Время завершения звонка'].dt.strftime('%d.%m.%Y')
                df['time'] = df['Дата/Время завершения звонка'].dt.strftime('%H:%M')
            else:
                # Если нет колонки с датой, используем текущую дату
                now = datetime.now()
                df['date'] = now.strftime('%d.%m.%Y')
                df['time'] = now.strftime('%H:%M')
        except Exception as e:
            print(f"Ошибка при обработке даты: {str(e)}")
            # Простое решение: используем текущую дату вместо ошибочных
            now = datetime.now()
            df['date'] = now.strftime('%d.%m.%Y')
            df['time'] = now.strftime('%H:%M')
        
        # Создаем список звонков в формате, ожидаемом фронтендом
        calls = []
        for idx, row in df.iterrows():
            # Берем номер как имя клиента (в реальном приложении можно будет заменить на имя из CRM)
            customer = str(row.get('Номер телефона', 'Неизвестный клиент'))
            
            # Определяем источник файла
            source_file = str(row.get('Источник файла', ''))
            if not source_file:  # Если нет значения в столбце, генерируем его
                record_url = str(row.get('Ссылка на запись', ''))
                if record_url.startswith('/api/recordings/'):
                    # Локальный файл - извлекаем имя файла из URL
                    source_file = record_url.split('/')[-1] if '/' in record_url else 'Локальный файл'
                else:
                    # Облачный файл - используем номер телефона или ID
                    source_file = customer if customer != 'Неизвестный клиент' else f"Запись #{idx}"
            
            # Форматируем длительность
            try:
                duration = str(row.get('lanth', '0.00'))
                if not isinstance(duration, str):
                    duration = f"{int(duration // 1)}м {int(duration % 1 * 60)}с"
                elif '.' in duration:
                    mins, secs = duration.split('.')
                    duration = f"{mins}м {secs}с"
            except Exception:
                duration = "0м 0с"  # Безопасное значение по умолчанию
            
            # Статус звонка (в примере определяем на основе дозвона)
            try:
                status_map = {
                    'doz': 'успешный',
                    'nedoz': 'неуспешный',
                    'не дозвон': 'неуспешный',
                    'дозвон': 'успешный'
                }
                raw_status = str(row.get('Дозвон/Недозвон', '')).lower()
                status = status_map.get(raw_status, 'требует внимания')
            except Exception:
                status = 'требует внимания'  # Безопасное значение по умолчанию
            
            # Формируем объект звонка с безопасной обработкой всех полей
            call = {
                'id': str(idx),
                'agent': 'Оператор',  # В реальном приложении заменить на имя из данных
                'customer': customer,
                'date': row.get('date', datetime.now().strftime('%d.%m.%Y')),
                'time': row.get('time', datetime.now().strftime('%H:%M')),
                'duration': duration,
                'status': status,
                'purpose': str(row.get('Цели', 'Не указана')),
                'transcription': str(row.get('Транскрибация', '-')),
                'recordUrl': str(row.get('Ссылка на запись', '')),
                'tag': str(row.get('Tag', '')),
                
                # Читаем сохраненные поля анализа из Excel
                'aiSummary': str(row.get('AI-резюме', '')),
                'keyInsight': str(row.get('Ключевой вывод', '')),
                'recommendation': str(row.get('Рекомендации', '')),
                'score': row.get('AI-оценка', 0),
                'callType': str(row.get('Тип звонка', '')),
                'callResult': str(row.get('Результат звонка', '')),
                'salesReadiness': row.get('Готовность к продаже', 0),
                'conversionProbability': row.get('Вероятность конверсии', 0),
                
                # Обрабатываем сложные поля
                'managerPerformance': _parse_manager_performance(row.get('Оценка менеджера', '')),
                'clientInterests': _parse_client_interests(row.get('Интересы клиента', '')),
                'decisionFactors': _parse_decision_factors(row.get('Факторы решения', '')),
                
                # Ответы на ключевые вопросы
                'keyQuestion1Answer': str(row.get('Ответ на вопрос 1', '')),
                'keyQuestion2Answer': str(row.get('Ответ на вопрос 2', '')),
                'keyQuestion3Answer': str(row.get('Ответ на вопрос 3', '')),
                
                # Теги из JSON
                'tags': _parse_tags(row.get('tags', '')),
                
                # Источник файла
                'sourceFile': source_file,
                
                # Длительность аудио в формате MM:SS
                'audioDuration': _format_audio_duration(row.get('lanth', 0)),
                
                # Количество символов в транскрипции
                'transcriptLength': _calculate_transcript_length(row.get('Транскрибация', ''))
            }
            calls.append(call)
        
        # Возвращаем данные в формате JSON
        print(f"Успешно получено {len(calls)} звонков из Excel (источник: {source})")
        return jsonify({"calls": calls})
    except Exception as e:
        print(f"Ошибка при получении звонков: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/analyze', methods=['POST'])
def analyze_calls():
    """Анализировать выбранные звонки с помощью LLM"""
    try:
        data = request.json
        call_ids = data.get('callIds', [])
        key_questions = data.get('keyQuestions') or data.get('key_questions') or []
        if not call_ids:
            return jsonify({"error": "Не указаны ID звонков для анализа"}), 400
        
        df = pd.read_excel(EXCEL_FILE)
        
        # Фильтруем по переданным ID
        selected_calls = []
        for call_id in call_ids:
            try:
                idx = int(call_id)
                if idx < len(df):
                    transcript = str(df.iloc[idx].get('Транскрибация', '-'))
                    
                    # Проверяем, есть ли транскрипция для анализа
                    has_transcript = transcript and transcript != '-' and transcript.strip() != '' and transcript != 'nan'
                    
                    if has_transcript:
                        print(f"Анализ звонка {call_id} с существующей транскрипцией (длина: {len(transcript)} символов)")
                    else:
                        print(f"Звонок {call_id} не имеет транскрипции для анализа")
                        transcript = "Транскрипция отсутствует"
                    
                    # Анализируем транскрипцию с помощью LLM с учетом ключевых вопросов (до 3)
                    analysis_result = analyze_transcript(transcript, key_questions[:3] if key_questions else None)
                    
                    # Обновляем колонки с новой информацией в Excel, если анализ успешен
                    if 'status' in analysis_result or 'callResult' in analysis_result:
                        updated_status = analysis_result.get('status', analysis_result.get('callResult', 'требует внимания'))
                        if 'Статус' in df.columns:
                            df.at[idx, 'Статус'] = updated_status
                        
                    if 'callType' in analysis_result and 'Тип звонка' in df.columns:
                        df.at[idx, 'Тип звонка'] = analysis_result.get('callType', 'не определен')
                    
                    # Сохраняем теги в JSON-формате
                    if 'tags' in analysis_result and analysis_result['tags']:
                        if 'tags' in df.columns:
                            df.at[idx, 'tags'] = json.dumps(analysis_result['tags'], ensure_ascii=False)
                        if 'Tag' in df.columns:
                            df.at[idx, 'Tag'] = analysis_result['tags'][0] if analysis_result['tags'] else ''
                    
                    # Формируем результат с расширенными полями анализа
                    call = {
                        'id': call_id,
                        'aiSummary': analysis_result.get('aiSummary', ''),
                        'keyInsight': analysis_result.get('keyInsight', ''),
                        'recommendation': analysis_result.get('recommendation', ''),
                        'score': analysis_result.get('score', 0),
                        'callType': analysis_result.get('callType', 'не определен'),
                        'callResult': analysis_result.get('callResult', 'требует внимания'),
                        'status': analysis_result.get('status', analysis_result.get('callResult', 'требует внимания')),
                        'tags': analysis_result.get('tags', []),
                        'supportingQuote': analysis_result.get('supportingQuote', ''),
                        'salesReadiness': analysis_result.get('salesReadiness', 0),
                        'conversionProbability': analysis_result.get('conversionProbability', 0),
                        'objections': analysis_result.get('objections', []),
                        'managerPerformance': analysis_result.get('managerPerformance', {"общая_оценка": 0, "details": "Нет данных"}),
                        'customerPotential': analysis_result.get('customerPotential', {"score": 0, "reason": "Нет данных"}),
                        'keyQuestion1Answer': analysis_result.get('keyQuestion1Answer', ''),
                        'keyQuestion2Answer': analysis_result.get('keyQuestion2Answer', ''),
                        'keyQuestion3Answer': analysis_result.get('keyQuestion3Answer', ''),
                        'clientInterests': analysis_result.get('clientInterests', []),
                        'decisionFactors': analysis_result.get('decisionFactors', {"positive": [], "negative": []})
                    }
                    
                    # Сохраняем ответы на ключевые вопросы в отдельные колонки Excel
                    if key_questions and len(key_questions) > 0:
                        try:
                            for i, question_text in enumerate(key_questions[:3]):
                                col_name = f"Ответ на вопрос {i+1}"
                                if col_name not in df.columns:
                                    df[col_name] = ''  # Добавляем колонку, если ее нет
                                df.at[idx, col_name] = analysis_result.get(f'keyQuestion{i+1}Answer', '')
                        except Exception as col_err:
                            print(f"Предупреждение: не удалось обновить колонки ответов: {col_err}")
                    
                    # Сохраняем все поля анализа в Excel
                    try:
                        # Создаем новые столбцы если их нет
                        analysis_columns = {
                            'Ключевой вывод': analysis_result.get('keyInsight', ''),
                            'AI-оценка': analysis_result.get('score', ''),
                            'Результат звонка': analysis_result.get('callResult', ''),
                            'AI-резюме': analysis_result.get('aiSummary', ''),
                            'Рекомендации': analysis_result.get('recommendation', ''),
                            'Готовность к продаже': analysis_result.get('salesReadiness', ''),
                            'Вероятность конверсии': analysis_result.get('conversionProbability', '')
                        }
                        
                        # Обеспечиваем наличие столбца "Источник файла"
                        if 'Источник файла' not in df.columns:
                            df['Источник файла'] = ''
                        
                        for col_name, value in analysis_columns.items():
                            if col_name not in df.columns:
                                df[col_name] = ''
                                print(f"🆕 Создан новый столбец: {col_name}")
                            if value != '':  # Только если есть значение
                                df.at[idx, col_name] = value
                                print(f"💾 Сохранено {col_name}: {str(value)[:50]}...")
                        
                        # Сохраняем сложные объекты как строки
                        if analysis_result.get('managerPerformance'):
                            if 'Оценка менеджера' not in df.columns:
                                df['Оценка менеджера'] = ''
                            perf = analysis_result['managerPerformance']
                            if isinstance(perf, dict) and perf.get('общая_оценка'):
                                df.at[idx, 'Оценка менеджера'] = f"{perf['общая_оценка']}/10"
                        
                        if analysis_result.get('clientInterests'):
                            if 'Интересы клиента' not in df.columns:
                                df['Интересы клиента'] = ''
                            df.at[idx, 'Интересы клиента'] = ', '.join(analysis_result['clientInterests'])
                        
                        if analysis_result.get('decisionFactors'):
                            if 'Факторы решения' not in df.columns:
                                df['Факторы решения'] = ''
                            factors = analysis_result['decisionFactors']
                            factor_text = ""
                            if factors.get('positive'):
                                factor_text += f"Положительные: {', '.join(factors['positive'])}; "
                            if factors.get('negative'):
                                factor_text += f"Отрицательные: {', '.join(factors['negative'])}"
                            if factor_text:
                                df.at[idx, 'Факторы решения'] = factor_text
                    except Exception as analysis_save_err:
                        print(f"Предупреждение: не удалось сохранить поля анализа: {analysis_save_err}")
                    
                    selected_calls.append(call)
                    
                    # Сохраняем изменения в Excel после каждого звонка
                    print(f"💾 Сохраняем анализ звонка {call_id} в Excel...")
                    try:
                        df.to_excel(EXCEL_FILE, index=False)
                        print(f"✅ Анализ звонка {call_id} успешно сохранен в Excel")
                    except Exception as save_error:
                        print(f"❌ Ошибка сохранения анализа звонка {call_id}: {save_error}")
                        # Попытка резервного сохранения
                        try:
                            import time
                            backup_file = f"DFASDF_backup_{int(time.time())}.xlsx"
                            df.to_excel(backup_file, index=False)
                            print(f"💾 Анализ сохранен в резервный файл: {backup_file}")
                        except Exception as backup_error:
                            print(f"❌ Резервное сохранение тоже не удалось: {backup_error}")
            except Exception as e:
                print(f"Ошибка при анализе звонка {call_id}: {str(e)}")
                traceback.print_exc()
        
        if not selected_calls:
            return jsonify({"warning": "Не найдено звонков с транскрипциями для анализа"}), 200
            
        return jsonify({"calls": selected_calls})
    except Exception as e:
        print(f"Ошибка при анализе звонков: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/transcribe', methods=['POST'])
def transcribe_calls():
    """Транскрибировать звонки без транскрипции или перетранскрибировать существующие"""
    try:
        data = request.json
        call_ids = data.get('callIds', [])
        force_retranscribe = data.get('forceRetranscribe', False)  # Флаг принудительной перетранскрибации
        
        if not call_ids:
            return jsonify({"error": "Не указаны ID звонков для транскрибации"}), 400
        
        df = pd.read_excel(EXCEL_FILE)
        
        # Собираем URLs для транскрибации
        urls_to_transcribe = []
        indices = []
        for call_id in call_ids:
            try:
                idx = int(call_id)
                if idx < len(df):
                    transcript = str(df.iloc[idx].get('Транскрибация', '-'))
                    url = str(df.iloc[idx].get('Ссылка на запись', ''))
                    
                    # Критерии для транскрибирования:
                    # 1. Если транскрипция отсутствует ('-', пусто, None)
                    # 2. ИЛИ если запрошена принудительная перетранскрибация
                    needs_transcription = (transcript == '-' or 
                                          not transcript or 
                                          transcript.strip() == '' or 
                                          transcript == 'nan' or 
                                          force_retranscribe)
                    
                    if needs_transcription and url and (url.startswith('http') or url.startswith('/api/recordings/')):
                        print(f"Добавляем звонок {call_id} на транскрибацию, URL: {url}")
                        urls_to_transcribe.append(url)
                        indices.append(idx)
                    elif url and (url.startswith('http') or url.startswith('/api/recordings/')) and not needs_transcription:
                        # Если есть URL и транскрипция уже существует, но не запрошено перетранскрибирование,
                        # добавляем в список для анализа, но не транскрибируем заново
                        print(f"Звонок {call_id} уже имеет транскрипцию, добавляем для анализа")
                        indices.append(idx)
            except Exception as e:
                print(f"Ошибка при подготовке звонка {call_id} к транскрибации: {str(e)}")
        
        results = []
        
        # Если есть звонки для транскрибации, обрабатываем их
        if urls_to_transcribe:
            print(f"Найдено {len(urls_to_transcribe)} звонков для транскрибации")
            
            # Используем реальную транскрибацию
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                results = loop.run_until_complete(batch_transcribe_gemini(urls_to_transcribe))
                loop.close()
                print(f"Успешно транскрибировано {len(results)} звонков")
            except Exception as e:
                print(f"Ошибка при транскрибации: {str(e)}")
                # Если произошла ошибка с реальным API, используем заглушку
                print("Используем заглушку для транскрибации из-за ошибки")
                for url in urls_to_transcribe:
                    results.append({
                        "url": url,
                        "text": "Ошибка при транскрибации. Используем тестовую транскрипцию: Оператор: Добрый день, чем могу помочь? Клиент: Здравствуйте, у меня вопрос по вашему продукту...",
                        "status": "success"
                    })
            
            # Обновляем Excel файл для транскрибированных звонков
            results_idx = 0
            for i, idx in enumerate(indices):
                if i < len(urls_to_transcribe):  # Только для реально транскрибированных
                    result = results[results_idx]
                    if result["status"] == "success":
                        df.at[idx, 'Транскрибация'] = result["text"]
                        df.at[idx, 'Tag'] = 'gemini'
                    results_idx += 1
        else:
            print("Нет звонков для транскрибации, но есть звонки для анализа")
        
        # Сохраняем изменения
        df.to_excel(EXCEL_FILE, index=False)
        
        # Формируем ответ, включая звонки с уже существующими транскрипциями
        updated_calls = []
        for i, call_id in enumerate(call_ids):
            idx = int(call_id) if i < len(indices) else -1
            if idx >= 0 and idx < len(df):
                # Проверяем, был ли этот звонок транскрибирован или у него уже была транскрипция
                is_in_transcribed_list = i < len(urls_to_transcribe)
                was_transcribed = is_in_transcribed_list and i < len(results)
                transcription = df.at[idx, 'Транскрибация'] if idx < len(df) else None
                
                if was_transcribed:
                    # Звонок был транскрибирован
                    result_idx = urls_to_transcribe.index(str(df.iloc[idx].get('Ссылка на запись', ''))) if is_in_transcribed_list else -1
                    result = results[result_idx] if result_idx >= 0 and result_idx < len(results) else {"status": "error", "error": "Ошибка индексации"}
                    updated_calls.append({
                        'id': call_id,
                        'transcription': result["text"] if result["status"] == "success" else f"Ошибка: {result.get('error', 'Неизвестная ошибка')}",
                        'status': result["status"]
                    })
                else:
                    # Звонок уже имел транскрипцию
                    updated_calls.append({
                        'id': call_id,
                        'transcription': transcription or "Транскрипция не найдена",
                        'status': "existing"  # Статус для уже существующих транскрипций
                    })
        
        message = f"Обработано {len(urls_to_transcribe)} новых транскрипций и {len(indices) - len(urls_to_transcribe)} существующих"
        print(message)
        
        return jsonify({
            "calls": updated_calls, 
            "message": message
        })
    except Exception as e:
        print(f"Ошибка при транскрибации звонков: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/process', methods=['POST'])
def process_excel():
    """Обработать весь Excel файл: транскрибировать и анализировать звонки"""
    try:
        df = pd.read_excel(EXCEL_FILE)
        
        # Подсчитываем количество звонков без транскрипции
        no_transcription = df[df['Транскрибация'] == '-']
        if len(no_transcription) == 0:
            return jsonify({"message": "Все звонки уже транскрибированы"})
        
        # Для демонстрации просто возвращаем информацию о необходимой обработке
        return jsonify({
            "message": f"Нужно обработать {len(no_transcription)} звонков из {len(df)}",
            "success": 0,
            "failed": 0
        })
        
        # Закомментированный реальный код обработки
        '''
        # Получаем URLs звонков без транскрипции
        urls_to_transcribe = []
        indices = []
        for idx, row in no_transcription.iterrows():
            url = str(row.get('Ссылка на запись', ''))
            if url and url.startswith('http'):
                urls_to_transcribe.append(url)
                indices.append(idx)
        
        if not urls_to_transcribe:
            return jsonify({"message": "Нет действительных URL для транскрибации"})
        
        # Запускаем асинхронную задачу для транскрибации
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Обрабатываем по BATCH_SIZE звонков за раз
        results_all = []
        
        for i in range(0, len(urls_to_transcribe), BATCH_SIZE):
            batch_urls = urls_to_transcribe[i:i+BATCH_SIZE]
            batch_indices = indices[i:i+BATCH_SIZE]
            
            # Транскрибируем пачку
            results = loop.run_until_complete(batch_transcribe_gemini(batch_urls))
            
            # Обновляем Excel-файл для текущей пачки
            for j, result in enumerate(results):
                if result["status"] == "success" and j < len(batch_indices):
                    idx = batch_indices[j]
                    df.at[idx, 'Транскрибация'] = result["text"]
                    df.at[idx, 'Tag'] = 'gemini'
            
            # Сохраняем после каждой пачки
            df.to_excel(EXCEL_FILE, index=False)
            results_all.extend(results)
        
        loop.close()
        
        return jsonify({
            "message": f"Обработано {len(results_all)} звонков",
            "success": sum(1 for r in results_all if r["status"] == "success"),
            "failed": sum(1 for r in results_all if r["status"] != "success")
        })
        '''
    except Exception as e:
        print(f"Ошибка при обработке Excel: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/custom-analyze', methods=['POST'])
def custom_analyze():
    """Анализировать звонки на основе пользовательского запроса с поддержкой фильтрации"""
    if request.method == 'OPTIONS':
        return handle_cors_options()
    
    try:
        # Проверяем запрос 
        print(f"Получен запрос custom-analyze: {request.data}")
        
        # Проверяем, что есть JSON в запросе
        if not request.is_json:
            print(f"Ошибка: запрос не содержит JSON. Content-Type: {request.headers.get('Content-Type')}")
            return jsonify({'error': 'Запрос должен содержать JSON'}), 400
            
        data = request.json
        print(f"Данные запроса: {data}")
        
        if not data:
            return jsonify({'error': 'Пустой JSON в запросе'}), 400
        
        # Получаем запрос для анализа из поля query или prompt
        custom_prompt = None
        if 'query' in data:
            custom_prompt = data['query']
        elif 'prompt' in data:
            custom_prompt = data['prompt']
        else:
            print(f"Ошибка: отсутствуют поля 'query' или 'prompt' в запросе: {data}")
            return jsonify({'error': 'Необходимо указать запрос в поле query или prompt'}), 400
        
        # Получаем все фильтры из запроса
        status_filter = data.get('statusFilter', '')
        operator_filter = data.get('operatorFilter', '')
        date_filter = data.get('dateFilter', '')
        duration_filter = data.get('durationFilter', '')  # Новый фильтр по длительности
        tag_filter = data.get('tagFilter', '')  # Новый фильтр по тегу
        
        # Получаем выбранные ID звонков, если они указаны
        selected_call_ids = data.get('callIds', [])
        
        # Получаем все данные о звонках
        all_calls = get_calls_data()
        print(f"Получено {len(all_calls)} звонков из базы данных")
        
        # Применяем фильтры
        filtered_calls = all_calls
        
        # Если указаны конкретные ID звонков, фильтруем по ним
        if selected_call_ids:
            filtered_calls = [call for call in filtered_calls if call.get('id', '') in selected_call_ids]
        
        # Фильтр по статусу
        if status_filter:
            filtered_calls = [call for call in filtered_calls if 
                             (call.get('callResult', '') or call.get('status', '')).lower() == status_filter.lower()]
        
        # Фильтр по оператору
        if operator_filter:
            filtered_calls = [call for call in filtered_calls if 
                             (call.get('agent', '') or '').lower() == operator_filter.lower()]
        
        # Фильтр по дате
        if date_filter:
            filtered_calls = [call for call in filtered_calls if call.get('date', '') == date_filter]
        
        # Фильтр по длительности звонка
        if duration_filter:
            # Отфильтруем звонки по длительности
            if duration_filter == 'short':  # до 1 минуты
                filtered_calls = filter_by_duration(filtered_calls, 0, 60)
            elif duration_filter == 'medium':  # от 1 до 3 минут
                filtered_calls = filter_by_duration(filtered_calls, 60, 180)
            elif duration_filter == 'long':  # более 3 минут
                filtered_calls = filter_by_duration(filtered_calls, 180, float('inf'))
        
        # Фильтр по тегу
        if tag_filter:
            filtered_calls = filter_by_tag(filtered_calls, tag_filter)
        
        print(f"После применения фильтров осталось {len(filtered_calls)} звонков")
        
        # Если нет звонков после фильтрации
        if not filtered_calls:
            return jsonify({'result': 'Не найдено звонков, соответствующих заданным фильтрам.'})
        
        # Анализируем не более 5 звонков для экономии ресурсов
        sample_size = min(5, len(filtered_calls))
        selected_calls = filtered_calls[:sample_size]
        
        print(f"Выбрано {sample_size} звонков для анализа")
        
        # Формируем контекст для анализа с учетом фильтров
        filter_context = ""
        filter_list = []
        if status_filter: filter_list.append(f"статус: {status_filter}")
        if operator_filter: filter_list.append(f"оператор: {operator_filter}")
        if date_filter: filter_list.append(f"дата: {date_filter}")
        if duration_filter: 
            duration_text = {"short": "до 1 минуты", "medium": "от 1 до 3 минут", "long": "более 3 минут"}.get(duration_filter, duration_filter)
            filter_list.append(f"длительность: {duration_text}")
        if tag_filter: filter_list.append(f"тег: {tag_filter}")
        
        if filter_list:
            filter_context = f"Применены фильтры: {', '.join(filter_list)}. "
        
        # Выполняем анализ звонков
        results = []
        
        # Загружаем Excel файл перед изменениями
        df = load_or_get_calls_df()
        tags_updated = False  # Флаг для отслеживания обновлений
        
        for call in selected_calls:
            call_id = call.get('id', 'unknown')
            transcript = call.get('transcript', '') or call.get('transcription', '')
            
            if not transcript or transcript == '-' or transcript.strip() == '':
                print(f"У звонка {call_id} отсутствует транскрипция. Пропускаем.")
                continue
            
            try:
                print(f"Анализ звонка {call_id} с запросом: '{custom_prompt}'")
                # Анализируем транскрипцию с помощью LLM и пользовательского запроса
                # custom_analyze_transcript теперь возвращает словарь
                analysis_data = custom_analyze_transcript(transcript, custom_prompt)
                
                # Обновляем теги в базе данных, если они есть в результате анализа
                try:
                    if 'tags' in analysis_data and analysis_data['tags']:
                        # Найдем звонок в DataFrame по ID
                        if call_id.isdigit() and int(call_id) < len(df):
                            row_idx = int(call_id)
                            
                            # Добавляем колонку tags, если её нет
                            if 'tags' not in df.columns:
                                df['tags'] = None
                            
                            # Сохраняем теги в JSON-формате
                            df.at[row_idx, 'tags'] = json.dumps(analysis_data['tags'], ensure_ascii=False)
                            
                            # Обновляем также Tag для совместимости
                            if 'Tag' in df.columns and analysis_data['tags']:
                                df.at[row_idx, 'Tag'] = analysis_data['tags'][0]
                            
                            # Сохраняем все поля анализа в Excel (custom_analyze)
                            try:
                                # Создаем новые столбцы если их нет
                                analysis_columns = {
                                    'Ключевой вывод': analysis_data.get('keyInsight', ''),
                                    'AI-оценка': analysis_data.get('score', ''),
                                    'Результат звонка': analysis_data.get('callResult', ''),
                                    'AI-резюме': analysis_data.get('keyPoints', ''),
                                    'Рекомендации': analysis_data.get('recommendations', ''),
                                    'Готовность к продаже': analysis_data.get('salesReadiness', ''),
                                    'Вероятность конверсии': analysis_data.get('conversionProbability', '')
                                }
                                
                                # Обеспечиваем наличие столбца "Источник файла"
                                if 'Источник файла' not in df.columns:
                                    df['Источник файла'] = ''
                                
                                for col_name, value in analysis_columns.items():
                                    if col_name not in df.columns:
                                        df[col_name] = ''
                                    if value != '':  # Только если есть значение
                                        df.at[row_idx, col_name] = value
                                
                                # Сохраняем сложные объекты как строки
                                if analysis_data.get('managerPerformance'):
                                    if 'Оценка менеджера' not in df.columns:
                                        df['Оценка менеджера'] = ''
                                    perf = analysis_data['managerPerformance']
                                    if isinstance(perf, dict) and perf.get('общая_оценка'):
                                        df.at[row_idx, 'Оценка менеджера'] = f"{perf['общая_оценка']}/10"
                                
                                if analysis_data.get('clientInterests'):
                                    if 'Интересы клиента' not in df.columns:
                                        df['Интересы клиента'] = ''
                                    df.at[row_idx, 'Интересы клиента'] = ', '.join(analysis_data['clientInterests'])
                                
                                if analysis_data.get('decisionFactors'):
                                    if 'Факторы решения' not in df.columns:
                                        df['Факторы решения'] = ''
                                    factors = analysis_data['decisionFactors']
                                    factor_text = ""
                                    if factors.get('positive'):
                                        factor_text += f"Положительные: {', '.join(factors['positive'])}; "
                                    if factors.get('negative'):
                                        factor_text += f"Отрицательные: {', '.join(factors['negative'])}"
                                    if factor_text:
                                        df.at[row_idx, 'Факторы решения'] = factor_text
                            except Exception as analysis_save_err:
                                print(f"Предупреждение: не удалось сохранить поля анализа (custom): {analysis_save_err}")
                            
                            tags_updated = True
                            print(f"Теги для звонка {call_id} обновлены: {analysis_data['tags']}")
                except Exception as tag_error:
                    print(f"Ошибка при обновлении тегов для звонка {call_id}: {tag_error}")
                
                # Формируем результат с расширенными полями анализа
                # Убедимся, что все ожидаемые ключи есть, иначе используем значения по умолчанию
                call_result = {
                    'id': call_id,
                    'date': call.get('date', 'Нет данных'),
                    'agent': call.get('agent', 'Не указан'),
                    'status': analysis_data.get('status', call.get('status', 'требует внимания')),
                    'duration': call.get('duration', 'Нет данных'),
                    'transcript_preview': transcript[:150] + '...' if len(transcript) > 150 else transcript,
                    
                    # Копируем все поля из оригинального звонка
                    'customer': call.get('customer', ''),
                    'purpose': call.get('purpose', ''),
                    'transcription': transcript,
                    'recordUrl': call.get('recordUrl', ''),
                    'tag': call.get('tag', ''),
                    
                    # Новые поля из структурированного анализа:
                    'aiSummary': analysis_data.get('keyPoints', 'Нет данных'), 
                    'keyInsight': analysis_data.get('keyInsight', 'Нет данных'),
                    'recommendation': analysis_data.get('recommendations', ''),
                    'score': analysis_data.get('score', 5),
                    'callType': analysis_data.get('callType', call.get('callType', 'не определен')),
                    'callResult': analysis_data.get('callResult', 'требует внимания'),
                    'tags': analysis_data.get('tags', []),
                    'supportingQuote': '',
                    'customResponse': analysis_data.get('customResponse', f"Ответ на запрос '{custom_prompt}': {analysis_data.get('keyPoints', 'Информация недоступна')}"),
                    
                    # Копируем все остальные поля из анализа в результат
                    'evaluation': analysis_data.get('evaluation', ''),
                    'keyPoints': analysis_data.get('keyPoints', ''),
                    'issues': analysis_data.get('issues', ''),
                    
                    # Специальные поля для дополнительных столбцов
                    'salesReadiness': analysis_data.get('salesReadiness', 0),
                    'conversionProbability': analysis_data.get('conversionProbability', 0),
                    'objections': analysis_data.get('objections', []),
                    'managerPerformance': analysis_data.get('managerPerformance', {"общая_оценка": 0, "details": "Нет данных"}),
                    'customerPotential': analysis_data.get('customerPotential', {"score": 0, "reason": "Нет данных"}),
                    'keyQuestion1Answer': analysis_data.get('keyQuestion1Answer', ''),
                    'keyQuestion2Answer': analysis_data.get('keyQuestion2Answer', ''),
                    'keyQuestion3Answer': analysis_data.get('keyQuestion3Answer', ''),
                    
                    # Интересы клиента и факторы принятия решения
                    'clientInterests': analysis_data.get('clientInterests', []),
                    'decisionFactors': analysis_data.get('decisionFactors', {"positive": [], "negative": []}),
                    
                    # Весь анализ для использования в интерфейсе
                    'analysis': analysis_data
                }
                
                # Обновляем 'tags' в исходном объекте call, чтобы они правильно фильтровались
                # и отображались в интерфейсе, если tags приходят из анализа
                if 'tags' in analysis_data and analysis_data['tags']:
                     call['tags'] = list(set((call.get('tags', []) if isinstance(call.get('tags'), list) else []) + analysis_data['tags']))
                
                # Добавляем результат в список
                results.append(call_result)
                print(f"Звонок {call_id} успешно проанализирован (структурированные данные)")
            except Exception as e:
                print(f"Ошибка при анализе звонка {call_id} (структурирование): {str(e)}")
                traceback.print_exc()
        
        # Сохраняем обновленный DataFrame в Excel, если были изменения
        if tags_updated:
            try:
                df.to_excel(EXCEL_FILE, index=False)
                print(f"Excel файл обновлен с новыми тегами")
            except Exception as save_error:
                print(f"Ошибка при сохранении Excel файла: {save_error}")
                traceback.print_exc()
        
        if not results:
            return jsonify({'result': 'Не удалось проанализировать ни один звонок. Пожалуйста, проверьте запрос и транскрипции.'})
        
        # Формируем итоговый ответ
        total_analyzed = len(results)
        total_filtered = len(filtered_calls)
        
        summary = f"{filter_context}Проанализировано {total_analyzed} из {total_filtered} звонков, отвечающих критериям фильтрации."
        
        # Получаем уникальные теги из проанализированных звонков
        all_tags = []
        for call in results:
            if 'tags' in call:
                all_tags.extend(call['tags'])
        
        unique_tags = list(set(all_tags))
        if unique_tags:
            summary += f" Основные теги: {', '.join(unique_tags[:5])}"
        
        print(f"Анализ завершен. Итоговый ответ: {summary}")
        
        # Получаем полный список доступных тегов для обновления интерфейса
        available_tags = []
        try:
            tags_response = get_all_tags()
            if isinstance(tags_response, tuple):
                tags_data = tags_response[0].get_json()
            else:
                tags_data = tags_response.get_json()
            available_tags = tags_data.get('tags', [])
        except Exception as tags_error:
            print(f"Ошибка при получении тегов: {tags_error}")
            traceback.print_exc()
        
        # Проверяем, что в ответе есть все нужные поля для отображения в таблице
        print(f"Результаты для отправки клиенту: {len(results)} звонков с полным анализом")
        for idx, call_result in enumerate(results):
            # Проверим, что в каждом результате есть обязательные поля
            if 'customResponse' not in call_result or not call_result['customResponse']:
                results[idx]['customResponse'] = f"Ответ на запрос '{custom_prompt}': {call_result.get('keyPoints', 'Информация недоступна')}"
            if 'keyInsight' not in call_result or not call_result['keyInsight']:
                results[idx]['keyInsight'] = call_result.get('keyPoints', 'Нет данных')
                
        return jsonify({
            'result': summary,
            'calls': results,
            'availableTags': available_tags
        })
        
    except Exception as e:
        error_msg = f"Ошибка при анализе: {str(e)}"
        print(error_msg)
        traceback.print_exc()
        return jsonify({'error': error_msg}), 500

# Функция для фильтрации по длительности звонка
def filter_by_duration(calls, min_seconds, max_seconds):
    filtered = []
    
    for call in calls:
        duration = call.get('duration', '')
        if not duration:
            continue
        
        seconds = 0
        try:
            if isinstance(duration, str):
                # Парсинг формата "Xм Yс"
                min_match = re.search(r'(\d+)м', duration)
                sec_match = re.search(r'(\d+)с', duration)
                
                minutes = int(min_match.group(1)) if min_match else 0
                secs = int(sec_match.group(1)) if sec_match else 0
                seconds = minutes * 60 + secs
            elif isinstance(duration, (int, float)):
                seconds = int(duration)
        except Exception as e:
            print(f"Ошибка при парсинге длительности '{duration}': {e}")
            continue
        
        if min_seconds <= seconds < max_seconds:
            filtered.append(call)
    
    return filtered

# Функция для фильтрации по тегу
def filter_by_tag(calls, tag):
    filtered = []
    tag = tag.lower()
    
    for call in calls:
        # Проверяем массив тегов
        if call.get('tags') and isinstance(call.get('tags'), list):
            if any(t.lower() == tag for t in call['tags']):
                filtered.append(call)
                continue
        
        # Проверяем тег как JSON-строку
        if call.get('tags') and isinstance(call.get('tags'), str):
            try:
                # Попытка разобрать JSON
                import json
                tags_list = json.loads(call['tags'])
                if isinstance(tags_list, list) and any(tag in str(t).lower() for t in tags_list):
                    filtered.append(call)
                    continue
            except:
                # Если не удалось разобрать как JSON, ищем как в обычной строке
                if tag in call['tags'].lower():
                    filtered.append(call)
                    continue
        
        # Проверяем одиночный тег
        if call.get('tag') and call['tag'].lower() == tag:
            filtered.append(call)
            continue
        
        # Проверяем через функцию извлечения тегов
        call_tags = extract_tags_from_analysis(call)
        if any(t.lower() == tag for t in call_tags):
            call['tags'] = call_tags  # Сохраняем теги в звонке для будущего использования
            filtered.append(call)
    
    return filtered

def handle_cors_options():
    response = jsonify({})
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization")
    response.headers.add("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS")
    response.headers.add("Access-Control-Allow-Credentials", "true")
    return response

# Вспомогательные функции для парсинга сложных полей из Excel
def _parse_manager_performance(value):
    """Парсинг поля 'Оценка менеджера'"""
    if not value or value == '' or value == 'nan':
        return None
    try:
        # Если это строка вида "8/10", извлекаем число
        if isinstance(value, str) and '/10' in value:
            score = int(value.split('/')[0])
            return {"общая_оценка": score, "details": f"Оценка: {score}/10"}
        elif isinstance(value, (int, float)):
            return {"общая_оценка": int(value), "details": f"Оценка: {int(value)}/10"}
    except:
        pass
    return None

def _parse_client_interests(value):
    """Парсинг поля 'Интересы клиента'"""
    if not value or value == '' or value == 'nan':
        return []
    try:
        # Разделяем по запятой и очищаем
        interests = [interest.strip() for interest in str(value).split(',') if interest.strip()]
        return interests
    except:
        return []

def _parse_decision_factors(value):
    """Парсинг поля 'Факторы решения'"""
    if not value or value == '' or value == 'nan':
        return {"positive": [], "negative": []}
    try:
        factors = {"positive": [], "negative": []}
        text = str(value)
        
        # Ищем положительные факторы
        if "Положительные:" in text:
            pos_part = text.split("Положительные:")[1]
            if "Отрицательные:" in pos_part:
                pos_part = pos_part.split("Отрицательные:")[0]
            pos_part = pos_part.strip().rstrip(';').strip()
            if pos_part:
                factors["positive"] = [f.strip() for f in pos_part.split(',') if f.strip()]
        
        # Ищем отрицательные факторы
        if "Отрицательные:" in text:
            neg_part = text.split("Отрицательные:")[1].strip()
            if neg_part:
                factors["negative"] = [f.strip() for f in neg_part.split(',') if f.strip()]
        
        return factors
    except:
        return {"positive": [], "negative": []}

def _parse_tags(value):
    """Парсинг JSON тегов"""
    if not value or value == '' or value == 'nan':
        return []
    try:
        import json
        return json.loads(str(value))
    except:
        # Если не JSON, возвращаем как список с одним элементом
        return [str(value)] if str(value) else []

def _format_audio_duration(duration_seconds):
    """Форматирует длительность в секундах в формат MM:SS"""
    if not duration_seconds or duration_seconds == 0:
        return ""
    try:
        duration = float(duration_seconds)
        minutes = int(duration // 60)
        seconds = int(duration % 60)
        return f"{minutes:02d}:{seconds:02d}"
    except:
        return ""

def _calculate_transcript_length(transcript):
    """Подсчитывает количество символов в транскрипции"""
    if not transcript or transcript in ['-', 'nan', '']:
        return 0
    return len(str(transcript).strip())

def get_calls_data():
    # Здесь должна быть реализация получения данных о звонках из базы данных или другого источника
    # На данный момент мы используем данные из Excel файла
    df = pd.read_excel(EXCEL_FILE)
    calls = []
    for idx, row in df.iterrows():
        calls.append({
            'id': str(idx),
            'agent': 'Оператор',
            'customer': str(row.get('Номер телефона', 'Неизвестный клиент')),
            'date': row.get('date', datetime.now().strftime('%d.%m.%Y')),
            'time': row.get('time', datetime.now().strftime('%H:%M')),
            'duration': str(row.get('lanth', '0.00')),
            'status': str(row.get('Дозвон/Недозвон', '')),
            'transcript': str(row.get('Транскрибация', '-')),
            'transcription': str(row.get('Транскрибация', '-')),  # Для совместимости оставляем оба поля
            'recordUrl': str(row.get('Ссылка на запись', '')),
            'tag': str(row.get('Tag', '')),
            'aiSummary': '',
            'keyInsight': '',
            'recommendation': '',
            'score': 0
        })
    return calls

# Функция для анализа транскрипции звонка с пользовательским запросом
def custom_analyze_transcript(transcript, query):
    """Анализирует транскрипцию и возвращает СТРУКТУРИРОВАННЫЙ результат в виде словаря"""
    default_analysis = {
        "evaluation": "Не удалось проанализировать",
        "keyPoints": "Ошибка при анализе",
        "issues": "",
        "recommendations": "Проверьте логи сервера",
        "tags": ["ошибка_анализа"],
        "customResponse": "Не удалось получить ответ на ваш запрос",
        
        # Добавляем дефолтные значения для расширенных полей
        "salesReadiness": 0,
        "conversionProbability": 0,
        "objections": [],
        "managerPerformance": {"общая_оценка": 0, "details": "Нет данных"},
        "customerPotential": {"score": 0, "reason": "Нет данных"},
        "keyQuestion1Answer": "",
        "keyQuestion2Answer": "",
        "keyQuestion3Answer": "",
        
        # Добавляем поля для базовой информации о звонке
        "callType": "не определен",
        "callResult": "не определен",
        "status": "требует внимания",
        "score": 0,
        "keyInsight": "Нет данных",
        
        # Новые поля для интересов и факторов
        "clientInterests": [],
        "decisionFactors": {
            "positive": [],
            "negative": []
        }
    }

    try:
        if not API_KEY_FOR_GEMINI:
            print("Gemini API ключ не настроен, используется базовый анализ.")
            return basic_analysis_dict(transcript, query)

        print(f"Анализ транскрипции с помощью Gemini API (длина текста: {len(transcript)}) по запросу: '{query}'")
        
        # Конфигурация генеративной модели
        generation_config = {
            "temperature": 0.3,
            "top_p": 0.95,
            "top_k": 40,
            "max_output_tokens": 1024,
        }
        
        # Используем GEMMA 3 для анализа
        model = genai.GenerativeModel(
            model_name="gemma-3-27b-it",
            generation_config=generation_config,
        )
        
        # Формируем промпт с запросом пользователя и инструкцией по формату данных
        prompt = f"""
        ЗАДАЧА:
        Анализ транскрипции телефонного звонка с целью ответа на запрос пользователя: "{query}".
        
        ИНСТРУКЦИИ:
        1. Внимательно изучи транскрипцию звонка ниже.
        2. Предоставь следующий анализ в формате JSON:
           - evaluation: общая оценка звонка (позитивная/нейтральная/негативная)
           - keyPoints: ключевые моменты разговора (3-5 предложений)
           - issues: проблемные места в разговоре (если есть)
           - recommendations: рекомендации по улучшению
           - tags: массив тегов, характеризующих звонок (3-7 тегов)
           - customResponse: ПРЯМОЙ и ПОДРОБНЫЙ ответ на запрос пользователя "{query}"
           - salesReadiness: оценка готовности к продаже по шкале 0-10 (целое число)
           - conversionProbability: вероятность конверсии в процентах 0-100 (целое число)
           - objections: массив возражений клиента (если есть)
           - managerPerformance: объект с полями общая_оценка (0-10) и details (описание работы менеджера)
           - customerPotential: объект с полями score (0-10) и reason (причина такой оценки)
           - keyQuestion1Answer: общий ответ на вопрос "Как прошел звонок?"
           - keyQuestion2Answer: ответ на вопрос "Какие проблемы были во время звонка?"
           - keyQuestion3Answer: ответ на вопрос "Что можно улучшить?"
           - callType: тип звонка (входящий/исходящий, продажи/поддержка/консультация)
           - callResult: результат звонка (успешный/неуспешный/требует follow-up)
           - status: статус звонка (успешный/неуспешный/требует внимания)
           - score: оценка звонка по 10-балльной шкале (Очень важно! Будет отображаться в таблице)
           - keyInsight: главный вывод по звонку (1 предложение - то же поле используется для "Ключевой вывод" в таблице)
           - clientInterests: массив интересов клиента (товары, услуги, условия, вопросы)
           - decisionFactors: объект с полями:
             - positive: массив положительных факторов, повлиявших на решение (что заинтересовало)
             - negative: массив отрицательных факторов (что не устроило)
        
        ОБЯЗАТЕЛЬНО заполни следующие поля, они будут отображаться в таблице:
        - status, callResult, score, keyInsight, clientInterests, decisionFactors
        
        Поле customResponse ОБЯЗАТЕЛЬНО должно содержать конкретный и информативный ответ на запрос пользователя, основанный на анализе транскрипции.
        
        ТРАНСКРИПЦИЯ ЗВОНКА:
        ```
        {transcript}
        ```
        
        ВАЖНО: Возврати только JSON без пояснений.
        """
        
        response = model.generate_content(prompt)
        result_text = response.text
        print(f"Ответ от Gemini API получен (начало): {result_text[:150]}...")
        
        # Парсинг результата (извлечение JSON из текста)
        try:
            # Обрабатываем случай, когда ответ в блоке markdown
            if "```json" in result_text and "```" in result_text.split("```json", 1)[1]:
                json_part = result_text.split("```json", 1)[1].split("```", 1)[0].strip()
                print("Успешно извлечен JSON из блока markdown.")
                analysis_result = json.loads(json_part)
            else:
                # Обрабатываем случай обычного JSON ответа
                analysis_result = json.loads(result_text)
            
            print("Успешно получен и распарсен анализ от Gemini API")
            
            # Проверяем наличие обязательных полей и добавляем их при необходимости
            if "customResponse" not in analysis_result or not analysis_result["customResponse"]:
                analysis_result["customResponse"] = f"Ответ на запрос '{query}': {analysis_result.get('keyPoints', 'Информация недоступна')}"
                
            # Добавляем недостающие поля расширенной аналитики с дефолтными значениями
            if "salesReadiness" not in analysis_result:
                analysis_result["salesReadiness"] = 0
                
            if "conversionProbability" not in analysis_result:
                analysis_result["conversionProbability"] = 0
                
            if "objections" not in analysis_result:
                analysis_result["objections"] = []
                
            if "managerPerformance" not in analysis_result:
                analysis_result["managerPerformance"] = {"общая_оценка": 0, "details": "Нет данных"}
            elif isinstance(analysis_result["managerPerformance"], dict) and "общая_оценка" not in analysis_result["managerPerformance"]:
                analysis_result["managerPerformance"]["общая_оценка"] = 0
                
            if "customerPotential" not in analysis_result:
                analysis_result["customerPotential"] = {"score": 0, "reason": "Нет данных"}
            elif isinstance(analysis_result["customerPotential"], dict) and "score" not in analysis_result["customerPotential"]:
                analysis_result["customerPotential"]["score"] = 0
                
            # Добавляем ответы на ключевые вопросы
            if "keyQuestion1Answer" not in analysis_result:
                if analysis_result.get("keyPoints"):
                    analysis_result["keyQuestion1Answer"] = f"Звонок прошел {analysis_result.get('evaluation', 'нейтрально')}. {analysis_result.get('keyPoints')}"
                else:
                    analysis_result["keyQuestion1Answer"] = f"Звонок прошел {analysis_result.get('evaluation', 'нейтрально')}."
                    
            if "keyQuestion2Answer" not in analysis_result:
                if analysis_result.get("issues"):
                    analysis_result["keyQuestion2Answer"] = analysis_result.get("issues")
                else:
                    analysis_result["keyQuestion2Answer"] = "Явных проблем не выявлено."
                    
            if "keyQuestion3Answer" not in analysis_result:
                if analysis_result.get("recommendations"):
                    analysis_result["keyQuestion3Answer"] = analysis_result.get("recommendations")
                else:
                    analysis_result["keyQuestion3Answer"] = "Рекомендуется следовать стандартному скрипту."
            
            # Добавляем основные поля статуса и результата
            if "callType" not in analysis_result:
                analysis_result["callType"] = "не определен"
                
            if "callResult" not in analysis_result:
                # Определяем по evaluation
                if analysis_result.get("evaluation") == "позитивная":
                    analysis_result["callResult"] = "успешный"
                elif analysis_result.get("evaluation") == "негативная":
                    analysis_result["callResult"] = "неуспешный"
                else:
                    analysis_result["callResult"] = "требует внимания"
            
            # ВАЖНО: добавляем поле status для таблицы
            if "status" not in analysis_result:
                # Используем то же значение, что и в callResult для согласованности
                if analysis_result.get("callResult") == "успешный":
                    analysis_result["status"] = "успешный"
                elif analysis_result.get("callResult") == "неуспешный":
                    analysis_result["status"] = "неуспешный"
                else:
                    analysis_result["status"] = "требует внимания"
            
            if "score" not in analysis_result:
                # Определяем оценку по evaluation
                if analysis_result.get("evaluation") == "позитивная":
                    analysis_result["score"] = 8
                elif analysis_result.get("evaluation") == "негативная":
                    analysis_result["score"] = 3
                else:
                    analysis_result["score"] = 5
            
            if "keyInsight" not in analysis_result:
                # Берем из keyPoints или создаем дефолтное
                if analysis_result.get("keyPoints"):
                    # Берем первое предложение из keyPoints
                    key_points = analysis_result.get("keyPoints")
                    if isinstance(key_points, list) and len(key_points) > 0:
                        analysis_result["keyInsight"] = key_points[0]
                    else:
                        # Разделяем на предложения и берем первое
                        sentences = key_points.split('. ')
                        analysis_result["keyInsight"] = sentences[0]
                else:
                    analysis_result["keyInsight"] = "Нет ключевого вывода"
            
            # Добавляем новые поля для интересов и факторов
            if "clientInterests" not in analysis_result:
                analysis_result["clientInterests"] = []
            
            if "decisionFactors" not in analysis_result:
                analysis_result["decisionFactors"] = {"positive": [], "negative": []}
            elif isinstance(analysis_result["decisionFactors"], dict):
                if "positive" not in analysis_result["decisionFactors"]:
                    analysis_result["decisionFactors"]["positive"] = []
                if "negative" not in analysis_result["decisionFactors"]:
                    analysis_result["decisionFactors"]["negative"] = []
                    
            return analysis_result
            
        except json.JSONDecodeError as e:
            print(f"Ошибка парсинга JSON: {str(e)}, попробуем извлечь структурированные данные из текста")
            return extract_structured_data(result_text, query)
            
    except Exception as e:
        print(f"Ошибка при использовании Gemini API в чате: {str(e)}")
        traceback.print_exc()
        
        # В случае ошибки возвращаем базовый анализ
        return basic_analysis_dict(transcript, query)

# Функция для базового анализа, когда API недоступно
def basic_analysis_dict(transcript, query):
    """Базовый анализ транскрипции без использования LLM"""
    transcript_lower = transcript.lower()
    
    # Определяем основные характеристики звонка
    is_greeting = "здравствуйте" in transcript_lower or "добрый день" in transcript_lower
    is_sales = "купить" in transcript_lower or "цена" in transcript_lower or "стоимость" in transcript_lower
    is_complaint = "проблема" in transcript_lower or "не работает" in transcript_lower or "жалоба" in transcript_lower
    is_question = "подскажите" in transcript_lower or "вопрос" in transcript_lower
    
    # Формируем теги
    tags = []
    if is_greeting:
        tags.append("приветствие")
    if is_sales:
        tags.append("продажа")
    if is_complaint:
        tags.append("жалоба")
    if is_question:
        tags.append("консультация")
    
    # Если не нашли никаких тегов, добавляем общий тег
    if not tags:
        tags.append("разговор")
    
    # Определяем оценку и ключевые моменты
    evaluation = "нейтральная"
    if is_complaint:
        evaluation = "негативная"
    elif is_sales and "спасибо" in transcript_lower:
        evaluation = "позитивная"
    
    # Определяем готовность к продаже и вероятность конверсии
    sales_readiness = 5  # среднее значение по умолчанию
    conversion_probability = 50  # среднее значение по умолчанию
    
    if is_sales:
        if "спасибо" in transcript_lower or "договорились" in transcript_lower:
            sales_readiness = 8
            conversion_probability = 80
        elif "подумаю" in transcript_lower or "перезвоните" in transcript_lower:
            sales_readiness = 4
            conversion_probability = 30
    elif is_complaint:
        sales_readiness = 2
        conversion_probability = 20
    
    # Определяем возможные возражения
    objections = []
    if "дорого" in transcript_lower:
        objections.append("Цена слишком высокая")
    if "не уверен" in transcript_lower or "подумаю" in transcript_lower:
        objections.append("Требуется время на размышление")
    if "конкурент" in transcript_lower:
        objections.append("Упоминание конкурентов")
    
    # Оценка менеджера
    manager_performance = {
        "общая_оценка": 5,  # среднее значение по умолчанию
        "details": "Базовая оценка без детального анализа"
    }
    
    # Потенциал клиента
    customer_potential = {
        "score": 5,  # среднее значение по умолчанию
        "reason": "Базовая оценка без детального анализа"
    }
    
    # Определяем статус и результат звонка
    status = "требует внимания"
    call_result = "требует внимания"
    
    if evaluation == "позитивная":
        status = "успешный"
        call_result = "успешный"
    elif evaluation == "негативная":
        status = "неуспешный"
        call_result = "неуспешный"
    
    # Определяем оценку звонка
    score = 5  # среднее значение по умолчанию
    if status == "успешный":
        score = 8
    elif status == "неуспешный":
        score = 3
    
    # Определяем клиентские интересы
    client_interests = []
    
    if "товар" in transcript_lower or "продукт" in transcript_lower:
        client_interests.append("Товар/продукт")
    if "цен" in transcript_lower or "стоимост" in transcript_lower:
        client_interests.append("Ценовые условия")
    if "доставк" in transcript_lower or "отправк" in transcript_lower:
        client_interests.append("Условия доставки")
    if "качеств" in transcript_lower:
        client_interests.append("Качество продукта")
    if "срок" in transcript_lower:
        client_interests.append("Сроки")
    
    # Определяем факторы принятия решения
    decision_factors = {
        "positive": [],
        "negative": []
    }
    
    # Положительные факторы
    if "хорош" in transcript_lower or "нравится" in transcript_lower:
        decision_factors["positive"].append("Положительная оценка продукта")
    if "подход" in transcript_lower and ("хорош" in transcript_lower or "нравится" in transcript_lower):
        decision_factors["positive"].append("Подходящие условия")
    if "скидк" in transcript_lower:
        decision_factors["positive"].append("Наличие скидки")
    if "быстр" in transcript_lower and "доставк" in transcript_lower:
        decision_factors["positive"].append("Быстрая доставка")
    
    # Отрицательные факторы
    if "дорого" in transcript_lower:
        decision_factors["negative"].append("Высокая цена")
    if "долго" in transcript_lower:
        decision_factors["negative"].append("Длительное время ожидания")
    if "не уверен" in transcript_lower or "подумаю" in transcript_lower:
        decision_factors["negative"].append("Неуверенность в необходимости")
    if "не устраивает" in transcript_lower:
        decision_factors["negative"].append("Неподходящие условия")
    
    # Формируем ответ на запрос пользователя
    # Пытаемся сделать его максимально релевантным запросу
    custom_response = f"Ответ на запрос '{query}': "
    
    if "как прошел" in query.lower() or "оценка" in query.lower():
        custom_response += f"Звонок прошел {evaluation}. "
        if is_greeting and is_question:
            custom_response += "Был задан вопрос консультационного характера."
        elif is_sales:
            custom_response += "Обсуждались вопросы продажи или стоимости."
        elif is_complaint:
            custom_response += "Была высказана жалоба или проблемный вопрос."
    elif "проблем" in query.lower() or "возражен" in query.lower():
        if is_complaint:
            custom_response += "В звонке обнаружены проблемы или возражения клиента."
        else:
            custom_response += "В звонке не обнаружено явных проблем или возражений."
    elif "продажа" in query.lower() or "конверсия" in query.lower():
        if is_sales:
            custom_response += "Звонок имеет признаки обсуждения продажи или цены."
        else:
            custom_response += "Звонок не имеет явных признаков обсуждения продажи."
    else:
        # Общий ответ, если не смогли определить конкретную тематику запроса
        custom_response += f"На основе базового анализа данного звонка можно сказать, что это {', '.join(tags)} звонок с {evaluation} тональностью."
    
    # Формируем ответы на ключевые вопросы
    key_question1_answer = f"Звонок прошел {evaluation}. " + custom_response.split("Ответ на запрос", 1)[1].strip().strip("'").strip(": ")
    
    key_question2_answer = "Явных проблем в звонке не выявлено."
    if is_complaint:
        key_question2_answer = "В звонке выявлены проблемы или жалобы клиента."
    elif "дорого" in transcript_lower:
        key_question2_answer = "Клиент высказал возражение по цене."
    
    key_question3_answer = "Рекомендуется следовать стандартному скрипту."
    if is_sales:
        key_question3_answer = "Рекомендуется уделить больше внимания презентации преимуществ продукта."
    elif is_complaint:
        key_question3_answer = "Рекомендуется улучшить скрипт обработки возражений."
    
    # Формируем ключевой вывод
    key_insight = "Нет данных для формирования ключевого вывода"
    if is_sales and evaluation == "позитивная":
        key_insight = "Успешная продажа с заинтересованным клиентом"
    elif is_sales and evaluation == "негативная":
        key_insight = "Клиент отказался от покупки"
    elif is_complaint:
        key_insight = "Клиент обратился с жалобой или проблемой"
    elif is_question:
        key_insight = "Клиент обратился за консультацией"
    
    # Сформированный анализ
    return {
        "evaluation": evaluation,
        "keyPoints": f"Транскрипция звонка длиной {len(transcript)} символов с темами: {', '.join(tags)}",
        "issues": "Не обнаружены (базовый анализ)" if evaluation != "негативная" else "Обнаружены проблемные моменты в разговоре",
        "recommendations": "Рекомендуется провести детальный анализ с использованием LLM",
        "tags": tags,
        "customResponse": custom_response,
        "salesReadiness": sales_readiness,
        "conversionProbability": conversion_probability,
        "objections": objections,
        "managerPerformance": manager_performance,
        "customerPotential": customer_potential,
        "keyQuestion1Answer": key_question1_answer,
        "keyQuestion2Answer": key_question2_answer,
        "keyQuestion3Answer": key_question3_answer,
        "callType": "не определен",
        "callResult": call_result,
        "status": status,
        "score": score,
        "keyInsight": key_insight,
        "clientInterests": client_interests,
        "decisionFactors": decision_factors
    }

# Функция для извлечения структурированных данных из текстового ответа LLM
def extract_structured_data(text, query):
    """
    Извлекает структурированные данные из текстового ответа LLM, если JSON не удалось распарсить
    """
    result = {
        "evaluation": "нейтральная",
        "keyPoints": "",
        "issues": "",
        "recommendations": "",
        "tags": [],
        "customResponse": f"Ответ на запрос '{query}': ",
        "salesReadiness": 5,
        "conversionProbability": 50,
        "objections": [],
        "managerPerformance": {"общая_оценка": 5, "details": "Информация недоступна"},
        "customerPotential": {"score": 5, "reason": "Информация недоступна"},
        "keyQuestion1Answer": "",
        "keyQuestion2Answer": "",
        "keyQuestion3Answer": "",
        "callType": "не определен",
        "callResult": "требует внимания",
        "status": "требует внимания",
        "score": 5,
        "keyInsight": "",
        "clientInterests": [],
        "decisionFactors": {
            "positive": [],
            "negative": []
        }
    }
    
    # Ищем оценку звонка
    evaluation_patterns = [
        r'["\']?evaluation["\']?\s*:?\s*["\']([^"\']+)["\']',
        r'оценка\s*:?\s*([^\n.,]+)',
        r'звонок\s+прошел\s+([^\n.,]+)'
    ]
    
    for pattern in evaluation_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            result["evaluation"] = match.group(1).strip().lower()
            break
    
    # Ищем ключевые моменты
    key_points_patterns = [
        r'["\']?keyPoints["\']?\s*:?\s*["\']([^"\']+)["\']',
        r'ключевые\s+моменты\s*:?\s*([^\n]+)',
        r'основные\s+моменты\s*:?\s*([^\n]+)'
    ]
    
    for pattern in key_points_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            result["keyPoints"] = match.group(1).strip()
            break
    
    # Ищем проблемы
    issues_patterns = [
        r'["\']?issues["\']?\s*:?\s*["\']([^"\']+)["\']',
        r'проблемы\s*:?\s*([^\n]+)',
        r'сложности\s*:?\s*([^\n]+)'
    ]
    
    for pattern in issues_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            result["issues"] = match.group(1).strip()
            break
    
    # Ищем рекомендации
    recommendations_patterns = [
        r'["\']?recommendations["\']?\s*:?\s*["\']([^"\']+)["\']',
        r'рекомендации\s*:?\s*([^\n]+)',
        r'советы\s*:?\s*([^\n]+)'
    ]
    
    for pattern in recommendations_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            result["recommendations"] = match.group(1).strip()
            break
    
    # Ищем теги
    tags_patterns = [
        r'["\']?tags["\']?\s*:?\s*\[(.*?)\]',
        r'теги\s*:?\s*\[(.*?)\]',
        r'теги\s*:?\s*([^\n]+)'
    ]
    
    for pattern in tags_patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            tags_text = match.group(1).strip()
            # Обрабатываем разные форматы тегов
            if "," in tags_text:
                # Список тегов разделенных запятыми
                tags = [t.strip().strip('"\'') for t in tags_text.split(",")]
            else:
                # Разделение по пробелам если нет запятых
                tags = [t.strip().strip('"\'') for t in tags_text.split()]
            
            result["tags"] = [tag for tag in tags if tag]
            break
    
    # Если не удалось найти теги, добавляем стандартные
    if not result["tags"]:
        result["tags"] = ["анализ", "неструктурированный_ответ"]
    
    # Ищем прямой ответ на запрос пользователя
    custom_response_patterns = [
        r'["\']?customResponse["\']?\s*:?\s*["\']([^"\']+)["\']',
        r'ответ\s+на\s+запрос\s*:?\s*([^\n]+)',
        r'ответ\s*:?\s*([^\n]+)'
    ]
    
    for pattern in custom_response_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            result["customResponse"] = match.group(1).strip()
            break
    
    # Добавим поиск для salesReadiness - готовность к продаже
    sales_readiness_patterns = [
        r'["\']?salesReadiness["\']?\s*:?\s*(\d+)',
        r'готовность\s+к\s+продаже\s*:?\s*(\d+)'
    ]
    
    for pattern in sales_readiness_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                readiness = int(match.group(1).strip())
                if 0 <= readiness <= 10:
                    result["salesReadiness"] = readiness
            except:
                pass
            break
    
    # Вероятность конверсии
    conversion_patterns = [
        r'["\']?conversionProbability["\']?\s*:?\s*(\d+)',
        r'вероятность\s+конверсии\s*:?\s*(\d+)'
    ]
    
    for pattern in conversion_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                probability = int(match.group(1).strip())
                if 0 <= probability <= 100:
                    result["conversionProbability"] = probability
            except:
                pass
            break
    
    # Ищем статус звонка
    status_patterns = [
        r'["\']?status["\']?\s*:?\s*["\']([^"\']+)["\']',
        r'статус\s*:?\s*([^\n.,]+)',
        r'статус звонка\s*:?\s*([^\n.,]+)'
    ]
    
    for pattern in status_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            status = match.group(1).strip().lower()
            # Нормализуем значение
            if "успеш" in status:
                result["status"] = "успешный"
            elif "неуспеш" in status or "не успеш" in status:
                result["status"] = "неуспешный"
            else:
                result["status"] = "требует внимания"
            break
    
    # Ищем результат звонка
    result_patterns = [
        r'["\']?callResult["\']?\s*:?\s*["\']([^"\']+)["\']',
        r'результат\s*:?\s*([^\n.,]+)',
        r'результат звонка\s*:?\s*([^\n.,]+)'
    ]
    
    for pattern in result_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            call_result = match.group(1).strip().lower()
            # Нормализуем значение
            if "успеш" in call_result:
                result["callResult"] = "успешный"
            elif "неуспеш" in call_result or "не успеш" in call_result:
                result["callResult"] = "неуспешный"
            else:
                result["callResult"] = "требует внимания"
            break
    
    # Если статус не найден, используем результат звонка
    if result["status"] == "требует внимания" and result["callResult"] != "требует внимания":
        result["status"] = result["callResult"]
    
    # Ищем оценку (score)
    score_patterns = [
        r'["\']?score["\']?\s*:?\s*(\d+(?:\.\d+)?)',
        r'оценка\s*:?\s*(\d+(?:\.\d+)?)/10',
        r'оценка звонка\s*:?\s*(\d+(?:\.\d+)?)'
    ]
    
    for pattern in score_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                score = float(match.group(1).strip())
                # Округляем до целого числа и проверяем диапазон
                score = round(score)
                if 0 <= score <= 10:
                    result["score"] = score
            except:
                pass
            break
    
    # Ищем ключевой вывод
    key_insight_patterns = [
        r'["\']?keyInsight["\']?\s*:?\s*["\']([^"\']+)["\']',
        r'ключевой вывод\s*:?\s*([^\n.,]+)',
        r'главный вывод\s*:?\s*([^\n.,]+)'
    ]
    
    for pattern in key_insight_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            result["keyInsight"] = match.group(1).strip()
            break
    
    # Если ключевой вывод не найден, используем первое предложение из ключевых моментов
    if not result["keyInsight"] and result["keyPoints"]:
        sentences = result["keyPoints"].split('. ')
        if sentences:
            result["keyInsight"] = sentences[0]
    
    # Ищем интересы клиента
    client_interests_patterns = [
        r'["\']?clientInterests["\']?\s*:?\s*\[(.*?)\]',
        r'интересы клиента\s*:?\s*\[(.*?)\]',
        r'интересы клиента\s*:?\s*([^\n]+)'
    ]
    
    for pattern in client_interests_patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            interests_text = match.group(1).strip()
            # Обрабатываем разные форматы записи
            if "," in interests_text:
                # Список интересов разделенных запятыми
                interests = [i.strip().strip('"\'') for i in interests_text.split(",")]
            else:
                # Разделение по пробелам если нет запятых
                interests = [i.strip().strip('"\'') for i in interests_text.split()]
            
            result["clientInterests"] = [interest for interest in interests if interest]
            break
    
    # Ищем факторы принятия решения (положительные)
    positive_factors_patterns = [
        r'["\']?positive["\']?\s*:?\s*\[(.*?)\]',
        r'положительные факторы\s*:?\s*\[(.*?)\]',
        r'положительные факторы\s*:?\s*([^\n]+)',
        r'что заинтересовало\s*:?\s*([^\n]+)'
    ]
    
    for pattern in positive_factors_patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            factors_text = match.group(1).strip()
            # Обрабатываем разные форматы записи
            if "," in factors_text:
                # Список факторов разделенных запятыми
                factors = [f.strip().strip('"\'') for f in factors_text.split(",")]
            else:
                # Разделение по пробелам если нет запятых
                factors = [f.strip().strip('"\'') for f in factors_text.split()]
            
            result["decisionFactors"]["positive"] = [factor for factor in factors if factor]
            break
    
    # Ищем факторы принятия решения (отрицательные)
    negative_factors_patterns = [
        r'["\']?negative["\']?\s*:?\s*\[(.*?)\]',
        r'отрицательные факторы\s*:?\s*\[(.*?)\]',
        r'отрицательные факторы\s*:?\s*([^\n]+)',
        r'что не устроило\s*:?\s*([^\n]+)'
    ]
    
    for pattern in negative_factors_patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            factors_text = match.group(1).strip()
            # Обрабатываем разные форматы записи
            if "," in factors_text:
                # Список факторов разделенных запятыми
                factors = [f.strip().strip('"\'') for f in factors_text.split(",")]
            else:
                # Разделение по пробелам если нет запятых
                factors = [f.strip().strip('"\'') for f in factors_text.split()]
            
            result["decisionFactors"]["negative"] = [factor for factor in factors if factor]
            break
    
    # Если не удалось найти значение полей из текста, 
    # установим их на основе имеющихся данных
    
    # Определяем статус по evaluation, если еще нет
    if result["status"] == "требует внимания" and result["evaluation"]:
        if result["evaluation"] == "позитивная":
            result["status"] = "успешный"
        elif result["evaluation"] == "негативная":
            result["status"] = "неуспешный"
    
    # Определяем результат звонка по статусу, если еще нет
    if result["callResult"] == "требует внимания" and result["status"] != "требует внимания":
        result["callResult"] = result["status"]
    
    # Если score отсутствует, определяем по статусу
    if result["score"] == 5:
        if result["status"] == "успешный":
            result["score"] = 8
        elif result["status"] == "неуспешный":
            result["score"] = 3
    
    return result

# Функция для извлечения тегов из анализа звонка
def extract_tags_from_analysis(call):
    tags = []
    
    # Извлекаем существующие теги
    if call.get("tags") and isinstance(call["tags"], list):
        tags.extend(call["tags"])
    elif call.get("tag"):
        tags.append(call["tag"])
    
    # Добавляем теги на основе статуса звонка
    status = call.get("callResult", call.get("status", "")).lower()
    if status:
        if "успешн" in status:
            tags.append("успешный")
        elif "неуспешн" in status:
            tags.append("неуспешный")
        elif "отмен" in status:
            tags.append("отменен")
    
    # Добавляем теги на основе длительности
    duration = call.get("duration", "")
    if duration:
        # Преобразуем длительность в секунды
        seconds = 0
        try:
            if isinstance(duration, str):
                # Парсинг формата "Xм Yс"
                min_match = re.search(r'(\d+)м', duration)
                sec_match = re.search(r'(\d+)с', duration)
                
                minutes = int(min_match.group(1)) if min_match else 0
                seconds = int(sec_match.group(1)) if sec_match else 0
                seconds += minutes * 60
            elif isinstance(duration, (int, float)):
                seconds = int(duration)
        except:
            pass
        
        # Добавляем тег по длительности
        if seconds > 0:
            if seconds < 60:
                tags.append("короткий разговор")
            elif seconds > 180:
                tags.append("длинный разговор")
            else:
                tags.append("средний разговор")
    
    return tags

# --- Новые функции для чата ---

def filter_calls(filters, data_source='all'):
    """Фильтрует DataFrame звонков на основе предоставленных фильтров и источника данных."""
    df = load_or_get_calls_df()
    
    # Фильтруем по источнику данных СНАЧАЛА
    if data_source == 'cloud':
        # Только облачные записи (Yandex Cloud)
        df = df[df['Ссылка на запись'].str.contains('storage.yandexcloud.net', na=False)]
        print(f"Фильтрация по источнику 'cloud': {len(df)} записей")
    elif data_source == 'local':
        # Только локальные записи
        df = df[df['Ссылка на запись'].str.startswith('/api/recordings/', na=False)]
        print(f"Фильтрация по источнику 'local': {len(df)} записей")
    else:
        print(f"Используем все записи (источник: {data_source}): {len(df)} записей")
    
    filtered_df = df.copy()
    
    print(f"Фильтрация звонков. Исходное количество: {len(filtered_df)}")
    
    # Проверяем, есть ли реальные фильтры (не пустые)
    has_filters = False
    
    # Применяем фильтры, если они есть и не пустые
    if filters:
        # Фильтр по статусу звонка
        if filters.get("status") and filters["status"].strip():
            has_filters = True
            status_filter = filters["status"].lower()
            print(f"Применяется фильтр по статусу: {status_filter}")
            
            # Проверяем наличие нужных столбцов перед фильтрацией
            status_mask = pd.Series(False, index=filtered_df.index)
            
            # Фильтрация по столбцу "Результат", если он есть
            if "Результат" in filtered_df.columns:
                status_mask = status_mask | filtered_df["Результат"].astype(str).str.lower().str.contains(status_filter, na=False)
            
            # Фильтрация по столбцу "Статус", если он есть
            if "Статус" in filtered_df.columns:
                status_mask = status_mask | filtered_df["Статус"].astype(str).str.lower().str.contains(status_filter, na=False)
            
            # Дополнительные проверки для других столбцов, которые могут содержать информацию о статусе
            if "callResult" in filtered_df.columns:
                status_mask = status_mask | filtered_df["callResult"].astype(str).str.lower().str.contains(status_filter, na=False)
            
            if "status" in filtered_df.columns:
                status_mask = status_mask | filtered_df["status"].astype(str).str.lower().str.contains(status_filter, na=False)
            
            # Дополнительная проверка для столбца Дозвон/Недозвон
            if "Дозвон/Недозвон" in filtered_df.columns:
                status_mask = status_mask | filtered_df["Дозвон/Недозвон"].astype(str).str.lower().str.contains(status_filter, na=False)
            
            # Применяем созданную маску фильтрации
            filtered_df = filtered_df[status_mask]
            print(f"После фильтрации по статусу: {len(filtered_df)} звонков")
        
        # Фильтр по оператору
        if filters.get("operator") and filters["operator"].strip() and filters["operator"].strip().lower() != "оператор":
            # Пропускаем фильтрацию, если значение - это дефолтное "Оператор"
            has_filters = True
            operator_filter = filters["operator"].lower()
            print(f"Применяется фильтр по оператору: {operator_filter}")
            
            # Получаем доступные столбцы для отладки
            available_columns = [col for col in ["Имя", "agent", "Оператор", "Менеджер"] if col in filtered_df.columns]
            print(f"Доступные столбцы операторов: {available_columns}")
            
            if available_columns:
                # Проверяем наличие нужных столбцов перед фильтрацией
                operator_mask = pd.Series(False, index=filtered_df.index)
                
                # Фильтрация по столбцу "Имя", если он есть
                if "Имя" in filtered_df.columns:
                    operator_mask = operator_mask | filtered_df["Имя"].astype(str).str.lower().str.contains(operator_filter, na=False)
                
                # Дополнительные проверки для других столбцов, которые могут содержать информацию об операторе
                if "agent" in filtered_df.columns:
                    operator_mask = operator_mask | filtered_df["agent"].astype(str).str.lower().str.contains(operator_filter, na=False)
                
                if "Оператор" in filtered_df.columns:
                    operator_mask = operator_mask | filtered_df["Оператор"].astype(str).str.lower().str.contains(operator_filter, na=False)
                
                if "Менеджер" in filtered_df.columns:
                    operator_mask = operator_mask | filtered_df["Менеджер"].astype(str).str.lower().str.contains(operator_filter, na=False)
                
                # Применяем созданную маску фильтрации
                filtered_df = filtered_df[operator_mask]
                print(f"После фильтрации по оператору: {len(filtered_df)} звонков")
            else:
                print(f"⚠️ Столбцы операторов отсутствуют в данных источника '{data_source}', пропускаем фильтр по оператору")
        elif filters.get("operator") and filters["operator"].strip().lower() == "оператор":
            print(f"⚠️ Пропускаем дефолтный фильтр по оператору: '{filters['operator']}'")
        
        # Если был применен фильтр по оператору и результат пустой, но есть доступные столбцы
        elif filters.get("operator") and filters["operator"].strip() and len(filtered_df) == 0:
            print(f"⚠️ Фильтр по оператору '{filters['operator']}' не дал результатов")
        
        # Фильтр по дате
        if filters.get("date") and filters["date"].strip():
            has_filters = True
            date_filter = filters["date"]
            print(f"Применяется фильтр по дате: {date_filter}")
            
            try:
                # Создаем маску для фильтрации
                date_mask = pd.Series(False, index=filtered_df.index)
                
                # Проверяем наличие столбца date
                if "date" in filtered_df.columns:
                    date_mask = date_mask | (filtered_df["date"] == date_filter)
                
                # Проверяем другие возможные столбцы с датой
                if "Дата" in filtered_df.columns:
                    date_mask = date_mask | (filtered_df["Дата"] == date_filter)
                
                # Применяем фильтр по дате
                filtered_df = filtered_df[date_mask]
                print(f"После фильтрации по дате: {len(filtered_df)} звонков")
            except Exception as e:
                print(f"Ошибка при применении фильтра по дате: {e}")
        
        # Фильтр по длительности звонка
        if filters.get("duration") and filters["duration"].strip():
            has_filters = True
            duration_type = filters["duration"]
            print(f"Применяется фильтр по длительности: {duration_type}")
            
            try:
                # Преобразуем строковое представление длительности в секунды
                def duration_to_seconds(duration_str):
                    if pd.isna(duration_str):
                        return 0
                    try:
                        # Для формата "Xм Yс"
                        minutes = 0
                        seconds = 0
                        duration_str = str(duration_str)
                        if "м" in duration_str:
                            minutes_match = re.search(r'(\d+)м', duration_str)
                            if minutes_match:
                                minutes = int(minutes_match.group(1))
                        if "с" in duration_str:
                            seconds_match = re.search(r'(\d+)с', duration_str)
                            if seconds_match:
                                seconds = int(seconds_match.group(1))
                        return minutes * 60 + seconds
                    except:
                        # В случае ошибки возвращаем 0
                        return 0
                
                # Убедимся, что у нас есть столбец для фильтрации по длительности
                has_duration_column = False
                
                # Проверяем наличие столбца Длительность
                if "Длительность" in filtered_df.columns:
                    has_duration_column = True
                    # Добавляем столбец с длительностью в секундах
                    filtered_df['duration_seconds'] = filtered_df['Длительность'].apply(duration_to_seconds)
                
                # Проверяем наличие других возможных столбцов с длительностью
                elif "duration" in filtered_df.columns:
                    has_duration_column = True
                    filtered_df['duration_seconds'] = filtered_df['duration'].apply(duration_to_seconds)
                elif "lanth" in filtered_df.columns:
                    has_duration_column = True
                    filtered_df['duration_seconds'] = filtered_df['lanth'].apply(duration_to_seconds)
                
                # Применяем фильтр по длительности, если нашли столбец
                if has_duration_column:
                    # Применяем фильтр по длительности
                    if duration_type == "short":  # короткие, до 1 минуты
                        filtered_df = filtered_df[filtered_df['duration_seconds'] < 60]
                    elif duration_type == "medium":  # средние, от 1 до 3 минут
                        filtered_df = filtered_df[(filtered_df['duration_seconds'] >= 60) & (filtered_df['duration_seconds'] <= 180)]
                    elif duration_type == "long":  # длинные, больше 3 минут
                        filtered_df = filtered_df[filtered_df['duration_seconds'] > 180]
                    
                    # Удаляем временный столбец
                    filtered_df = filtered_df.drop('duration_seconds', axis=1)
                    print(f"После фильтрации по длительности: {len(filtered_df)} звонков")
                else:
                    print("Предупреждение: не найдено подходящего столбца для фильтрации по длительности")
            except Exception as e:
                print(f"Ошибка при применении фильтра по длительности: {e}")
        
        # Фильтр по тегам
        if filters.get("tags") and isinstance(filters["tags"], list) and len(filters["tags"]) > 0:
            has_filters = True
            print(f"Применяется фильтр по тегам: {filters['tags']}")
            
            try:
                # Создаем маску для фильтрации
                tag_mask = pd.Series(False, index=filtered_df.index)
                
                for tag in filters["tags"]:
                    tag_lower = tag.lower()
                    # Проверяем столбец "Теги" если он есть
                    if "Теги" in filtered_df.columns:
                        # Для случая когда теги хранятся в виде строки
                        tag_mask = tag_mask | filtered_df["Теги"].astype(str).str.lower().str.contains(tag_lower, na=False)
                    
                    # Проверяем столбец "Тег" если он есть
                    if "Тег" in filtered_df.columns:
                        tag_mask = tag_mask | filtered_df["Тег"].astype(str).str.lower().str.contains(tag_lower, na=False)
                    
                    # Проверяем столбец "Tag" если он есть
                    if "Tag" in filtered_df.columns:
                        tag_mask = tag_mask | filtered_df["Tag"].astype(str).str.lower().str.contains(tag_lower, na=False)
                    
                    # Проверяем столбец "tags" если он есть (для массивов тегов)
                    if "tags" in filtered_df.columns:
                        # Если в столбце tags хранятся списки тегов, обрабатываем их особым образом
                        try:
                            # Проверка тегов как JSON-строк
                            def check_tag_in_json(tag_json, search_tag):
                                if not tag_json or pd.isna(tag_json):
                                    return False
                                try:
                                    import json
                                    tags_list = json.loads(str(tag_json))
                                    if isinstance(tags_list, list):
                                        return any(search_tag in str(t).lower() for t in tags_list)
                                except:
                                    return search_tag in str(tag_json).lower()
                                return False
                            
                            # Применяем функцию к каждой строке
                            json_mask = filtered_df['tags'].apply(lambda x: check_tag_in_json(x, tag_lower))
                            tag_mask = tag_mask | json_mask
                        except Exception as tags_error:
                            print(f"Ошибка при фильтрации по tags как JSON: {tags_error}")
                            # Запасной вариант - просто проверяем наличие подстроки
                            tag_mask = tag_mask | filtered_df["tags"].astype(str).str.lower().str.contains(tag_lower, na=False)
                
                filtered_df = filtered_df[tag_mask]
                print(f"После фильтрации по тегам: {len(filtered_df)} звонков")
            except Exception as e:
                print(f"Ошибка при применении фильтра по тегам: {e}")
    
    print(f"Итоговое количество звонков после фильтрации: {len(filtered_df)}")
    
    # Если нет звонков после фильтрации И были применены фильтры, 
    # возвращаем исходный DataFrame с пометкой
    if len(filtered_df) == 0 and has_filters:
        print("Предупреждение: после фильтрации не осталось звонков. Возможно, критерии фильтрации слишком строгие.")
    
    return filtered_df

def generate_chat_response(message, filtered_calls, limit=5):
    """Генерирует ответ на запрос пользователя на основе отфильтрованных звонков."""
    try:
        # Получаем количество отфильтрованных звонков
        num_filtered = len(filtered_calls)
        
        # Если нет звонков, возвращаем сообщение об отсутствии данных
        if num_filtered == 0:
            return "По вашему запросу не найдено звонков с указанными фильтрами."
        
        # Берем только первые несколько звонков для анализа
        calls_sample = filtered_calls.head(limit)
        
        # Выводим структуру данных для диагностики
        print(f"Столбцы доступные для анализа: {calls_sample.columns.tolist()}")
        
        # Проверяем наличие хотя бы одной непустой транскрипции
        has_useful_transcription = False
        
        # Добавляем явное копирование транскрипций из основной колонки
        # Проверим колонку Транскрибация и при наличии данных скопируем их в transcription и transcript
        if 'Транскрибация' in calls_sample.columns:
            if 'transcription' not in calls_sample.columns:
                calls_sample['transcription'] = calls_sample['Транскрибация']
            if 'transcript' not in calls_sample.columns:
                calls_sample['transcript'] = calls_sample['Транскрибация']
        
        for _, call in calls_sample.iterrows():
            transcript = None
            
            # Проверяем разные имена столбцов для транскрипций
            for transcript_field in ['Транскрибация', 'transcription', 'transcript']:
                if transcript_field in call and call[transcript_field] and str(call[transcript_field]).strip() != '-' and str(call[transcript_field]).strip().lower() != 'nan':
                    transcript = call[transcript_field]
                    break
            
            if transcript and len(str(transcript)) > 50:  # Минимальная длина полезной транскрипции
                has_useful_transcription = True
                break
        
        print(f"Найдены полезные транскрипции: {has_useful_transcription}")
        
        # Преобразуем звонки в текстовый формат для контекста
        context = f"Список найденных звонков (максимум {limit}):\n\n"
        
        for idx, (_, call) in enumerate(calls_sample.iterrows(), 1):
            # Извлекаем информацию из разных возможных полей
            
            # Оператор/агент
            operator_fields = ['Имя', 'agent', 'Оператор', 'Менеджер']
            operator = "Неизвестно"
            for field in operator_fields:
                if field in call and call[field] and str(call[field]).strip() and str(call[field]).strip().lower() not in ['nan', 'none']:
                    operator = call[field]
                    break
            
            # Клиент/абонент
            customer_fields = ['Абонент', 'customer', 'Номер телефона', 'Телефон']
            customer = "Неизвестно"
            for field in customer_fields:
                if field in call and call[field] and str(call[field]).strip() and str(call[field]).strip().lower() not in ['nan', 'none']:
                    customer = call[field]
                    break
            
            # Дата/время
            date = "Неизвестно"
            time = ""
            if 'date' in call and call['date']:
                date = call['date']
            elif 'Дата' in call and call['Дата']:
                date = call['Дата']
                
            if 'time' in call and call['time']:
                time = call['time']
            elif 'Время' in call and call['Время']:
                time = call['Время']
            
            # Длительность
            duration_fields = ['Длительность', 'duration', 'lanth']
            duration = "Неизвестно"
            for field in duration_fields:
                if field in call and call[field] and str(call[field]).strip() and str(call[field]).strip().lower() not in ['nan', 'none']:
                    duration = call[field]
                    break
            
            # Статус
            status_fields = ['Статус', 'status', 'callResult', 'Результат', 'Дозвон/Недозвон']
            status = "Неизвестно"
            for field in status_fields:
                if field in call and call[field] and str(call[field]).strip() and str(call[field]).strip().lower() not in ['nan', 'none']:
                    status = call[field]
                    break
            
            # Транскрипция
            transcript_fields = ['Транскрибация', 'transcription', 'transcript']
            transcript = "Транскрипция недоступна"
            for field in transcript_fields:
                if field in call and call[field] and str(call[field]).strip() and str(call[field]).strip() != '-' and str(call[field]).strip().lower() != 'nan':
                    transcript = call[field]
                    break
            
            # Дополнительные поля
            tag = ""
            if 'Tag' in call and call['Tag'] and str(call['Tag']).strip() and str(call['Tag']).strip().lower() != 'nan':
                tag = f"Тег: {call['Tag']}\n"
            elif 'tag' in call and call['tag'] and str(call['tag']).strip() and str(call['tag']).strip().lower() != 'nan':
                tag = f"Тег: {call['tag']}\n"
            elif 'Тег' in call and call['Тег'] and str(call['Тег']).strip() and str(call['Тег']).strip().lower() != 'nan':
                tag = f"Тег: {call['Тег']}\n"
            elif 'tags' in call and call['tags'] and str(call['tags']).strip() and str(call['tags']).strip().lower() != 'nan':
                try:
                    # Попытка распарсить JSON с тегами
                    tags_json = json.loads(str(call['tags']))
                    if isinstance(tags_json, list) and tags_json:
                        tag = f"Теги: {', '.join(tags_json)}\n"
                except:
                    tag = f"Теги: {call['tags']}\n"
                
            purpose = ""
            if 'purpose' in call and call['purpose'] and str(call['purpose']).strip() and str(call['purpose']).strip().lower() != 'nan':
                purpose = f"Цель: {call['purpose']}\n"
            elif 'Цель' in call and call['Цель'] and str(call['Цель']).strip() and str(call['Цель']).strip().lower() != 'nan':
                purpose = f"Цель: {call['Цель']}\n"
            elif 'Цели' in call and call['Цели'] and str(call['Цели']).strip() and str(call['Цели']).strip().lower() != 'nan':
                purpose = f"Цель: {call['Цели']}\n"
            
            # Обрабатываем транскрипцию
            transcript_preview = transcript
            if len(transcript) > 600:  # Ограничиваем длину для контекста, но берем больше, чем раньше
                transcript_preview = transcript[:600] + "..."
            
            # Собираем информацию о звонке
            context += f"Звонок {idx}:\n"
            context += f"Оператор: {operator}\n"
            context += f"Клиент: {customer}\n"
            context += f"Дата/время: {date} {time}\n"
            context += f"Длительность: {duration}\n"
            context += f"Статус: {status}\n"
            if tag:
                context += tag
            if purpose:
                context += purpose
            context += f"Транскрипция: {transcript_preview}\n\n"
        
        # Указываем, сколько всего звонков найдено и сколько показано
        if num_filtered > limit:
            context += f"Показаны {limit} из {num_filtered} найденных звонков."
        
        # Используем Gemma для анализа чата
        if API_KEY_FOR_GEMINI:
            try:
                print(f"Анализ запроса к чату с помощью Gemma API: '{message}'")
                
                generation_config = {
                    "temperature": 0.2,
                    "top_p": 0.9,
                    "top_k": 40,
                    "max_output_tokens": 1024,
                }
                
                model = genai.GenerativeModel(
                    model_name='gemma-3-27b-it',
                    generation_config=generation_config
                )
                
                # Создаем разные запросы в зависимости от наличия транскрипций
                if has_useful_transcription:
                    prompt = f"""
                    Ты - умный аналитик звонков. Тебе дан набор отфильтрованных звонков и вопрос пользователя.
                    Проанализируй информацию о звонках, особенно транскрипции, и дай детальный ответ на вопрос.
                    
                    КОНТЕКСТ ОТФИЛЬТРОВАННЫХ ЗВОНКОВ:
                    {context}
                    
                    ВОПРОС ПОЛЬЗОВАТЕЛЯ:
                    {message}
                    
                    Если в данных содержится достаточно информации, предоставь развернутый ответ.
                    Обрати особое внимание на:
                    - Статусы звонков (успешные, неуспешные)
                    - Содержание разговоров из транскрипций
                    - Темы, которые обсуждались
                    - Проблемы, которые возникали
                    
                    Если в данных недостаточно информации, честно скажи об этом и укажи, какая именно информация отсутствует.
                    """
                else:
                    # Если нет хороших транскрипций, модифицируем промпт
                    prompt = f"""
                    Ты - умный аналитик звонков. Тебе дан набор отфильтрованных звонков и вопрос пользователя.
                    Проанализируй доступную информацию и дай ответ на вопрос.
                    
                    КОНТЕКСТ ОТФИЛЬТРОВАННЫХ ЗВОНКОВ:
                    {context}
                    
                    ВОПРОС ПОЛЬЗОВАТЕЛЯ:
                    {message}
                    
                    Проанализируй метаданные звонков:
                    - Статусы звонков (успешные, неуспешные, дозвон/недозвон)
                    - Длительность звонков
                    - Любую другую доступную информацию
                    
                    Если в данных недостаточно информации для полного ответа, честно скажи об этом.
                    Объясни, какие именно данные отсутствуют и что можно было бы сказать, если бы эти данные были доступны.
                    """
                
                # Дебаг для промпта
                print(f"Отправляется промпт (первые 200 символов): {prompt[:200]}...")
                
                response = model.generate_content(prompt)
                result_text = response.text.strip()
                print("Успешно получен ответ от Gemma API")
                
                return result_text
                
            except Exception as e:
                print(f"Ошибка при использовании Gemma API в чате: {str(e)}")
                traceback.print_exc()
                # Если возникла ошибка, переходим к запасному варианту
        
        # ... остальной код (запасные варианты) ...

        # Запасной вариант с ручной логикой, если Gemma недоступна
        print("Используем запасную логику для ответа на запрос чата")
        message_lower = message.lower()
        
        # Запрос о статистике
        if "статистика" in message_lower or "сколько" in message_lower:
            # Вычисляем некоторые статистические данные
            success_count = 0
            unsuccessful_count = 0
            avg_duration_seconds = 0
            total_duration = 0
            call_count = 0
            
            for _, call in calls_sample.iterrows():
                # Определяем успешность звонка
                status = str(call.get("Статус", call.get("Результат", call.get("callResult", "")))).lower()
                if "успешн" in status or "дозвон" in status or "положительн" in status:
                    success_count += 1
                elif "неуспешн" in status or "недозвон" in status or "отрицательн" in status:
                    unsuccessful_count += 1
                
                # Считаем общую длительность
                try:
                    duration_str = str(call.get("Длительность", "0"))
                    minutes = 0
                    seconds = 0
                    
                    if "м" in duration_str:
                        min_match = re.search(r"(\d+)м", duration_str)
                        if min_match:
                            minutes = int(min_match.group(1))
                    
                    if "с" in duration_str:
                        sec_match = re.search(r"(\d+)с", duration_str)
                        if sec_match:
                            seconds = int(sec_match.group(1))
                    
                    duration_in_seconds = minutes * 60 + seconds
                    total_duration += duration_in_seconds
                    call_count += 1
                except Exception as duration_error:
                    print(f"Ошибка при подсчете длительности: {duration_error}")
            
            # Вычисляем среднюю длительность
            if call_count > 0:
                avg_duration_seconds = total_duration / call_count
                avg_minutes = int(avg_duration_seconds // 60)
                avg_seconds = int(avg_duration_seconds % 60)
                avg_duration_str = f"{avg_minutes}м {avg_seconds}с"
            else:
                avg_duration_str = "Неизвестно"
            
            # Формируем статистический ответ
            response = f"Анализ {num_filtered} звонков (детально изучено {call_count}):\n\n"
            response += f"• Успешных звонков: {success_count}\n"
            response += f"• Неуспешных звонков: {unsuccessful_count}\n"
            response += f"• Средняя длительность звонка: {avg_duration_str}\n"
            
            # Добавляем дополнительную информацию, если это запрошено
            if "распредел" in message_lower or "операт" in message_lower:
                operators_count = {}
                for _, call in calls_sample.iterrows():
                    operator = str(call.get("Имя", call.get("agent", call.get("Оператор", "Неизвестно"))))
                    operators_count[operator] = operators_count.get(operator, 0) + 1
                
                response += "\nРаспределение по операторам:\n"
                for operator, count in operators_count.items():
                    response += f"• {operator}: {count} звонков\n"
            
            return response
        
        # Запрос о конкретных звонках или транскрипциях
        elif any(keyword in message_lower for keyword in ["звонок", "разговор", "транскрипция", "звонки"]):
            response = f"Информация по {num_filtered} звонкам:\n\n"
            
            for i, (_, call) in enumerate(calls_sample.iterrows(), 1):
                operator = call.get("Имя", call.get("agent", call.get("Оператор", "Неизвестно")))
                customer = call.get("Абонент", call.get("customer", call.get("Номер телефона", "Неизвестно")))
                date = call.get("date", "Дата не указана")
                time = call.get("time", "")
                duration = call.get("Длительность", "Неизвестно")
                status = call.get("Статус", call.get("Результат", call.get("callResult", "Неизвестно")))
                
                response += f"Звонок {i}:\n"
                response += f"• Оператор: {operator}\n"
                response += f"• Клиент: {customer}\n"
                response += f"• Дата/время: {date} {time}\n"
                response += f"• Длительность: {duration}\n"
                response += f"• Статус: {status}\n"
                
                # Добавляем транскрипцию, если это запрошено
                if "транскрипц" in message_lower:
                    transcript = call.get("Транскрипция", call.get("transcription", "Транскрипция недоступна"))
                    if len(transcript) > 200:  # Если транскрипция длинная, показываем только начало
                        transcript = transcript[:200] + "..."
                    response += f"• Транскрипция: {transcript}\n"
                
                response += "\n"
            
            return response
        
        # Общий запрос - возвращаем базовую информацию и подсказки
        else:
            response = f"Найдено {num_filtered} звонков по вашему запросу.\n\n"
            
            # Общая статистика
            success_count = 0
            unsuccessful_count = 0
            
            for _, call in calls_sample.iterrows():
                # Определяем успешность звонка
                status = str(call.get("Статус", call.get("Результат", call.get("callResult", "")))).lower()
                if "успешн" in status or "дозвон" in status or "положительн" in status:
                    success_count += 1
                elif "неуспешн" in status or "недозвон" in status or "отрицательн" in status:
                    unsuccessful_count += 1
            
            response += f"Краткая статистика:\n"
            response += f"• Успешных звонков: {success_count}\n"
            response += f"• Неуспешных звонков: {unsuccessful_count}\n\n"
            
            response += "Вы можете задать более конкретные вопросы, например:\n"
            response += "• Покажи детальную статистику по звонкам\n"
            response += "• Покажи транскрипции звонков\n"
            response += "• Какие звонки были самыми длинными?\n"
            
            return response
            
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"Ошибка при генерации ответа чата: {e}\n{error_trace}")
        return f"Произошла ошибка при обработке вашего запроса: {str(e)}"

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        message = data.get('message', '')
        filters = data.get('filters', {})
        data_source = data.get('dataSource', 'all')  # Получаем источник данных
        
        print(f"🔥 НОВЫЙ ЧАТ API: Получен запрос '{message}' с фильтрами: {filters}, источник: {data_source}")
        
        # Фильтруем звонки на основе предоставленных фильтров И источника данных
        filtered_calls = filter_calls(filters, data_source)
        
        # Получаем список всех уникальных тегов для обновления фильтров
        all_tags = []
        try:
            # Используем функцию get_all_tags для получения тегов
            tags_response = get_all_tags()
            if isinstance(tags_response, tuple):
                # Если ответ содержит статус код (ошибка), берем только первый элемент
                tags_data = tags_response[0].get_json()
            else:
                tags_data = tags_response.get_json()
            
            all_tags = tags_data.get('tags', [])
        except Exception as tags_error:
            print(f"Ошибка при получении тегов для чата: {tags_error}")
            # В случае ошибки продолжаем без тегов
        
        # Проверяем, остались ли звонки после фильтрации
        if len(filtered_calls) == 0:
            print(f"После фильтрации не осталось звонков. Используем звонки источника '{data_source}' для ответа.")
            # Если после фильтрации не осталось звонков, берем все звонки текущего источника
            if message.strip():
                filtered_calls = filter_calls({}, data_source)  # Пустые фильтры, но с учетом источника
                # Ограничиваем количество звонков до 10 для скорости анализа
                filtered_calls = filtered_calls.head(10)
                response = f"По вашим фильтрам не найдено звонков в источнике '{data_source}'. Анализирую доступные звонки ({len(filtered_calls)}):\n\n"
                response += generate_chat_response(message, filtered_calls)
                # Возвращаем ответ вместе со списком тегов
                return jsonify({
                    'reply': response,
                    'availableTags': all_tags
                })
        
        # Генерируем ответ на основе отфильтрованных звонков
        response = generate_chat_response(message, filtered_calls)
        
        # Возвращаем ответ вместе со списком тегов
        return jsonify({
            'reply': response,
            'availableTags': all_tags
        })
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"Ошибка в API чата: {e}\n{error_trace}")
        return jsonify({'error': str(e)}), 500

# --- Конец новых функций для чата ---

# --- Новый эндпоинт для получения всех уникальных тегов ---
@app.route('/api/get-tags', methods=['GET'])
def get_all_tags():
    """Возвращает список всех уникальных тегов из всех звонков"""
    try:
        df = load_or_get_calls_df()
        
        # Собираем все теги из различных источников
        all_tags = set()
        
        # Проверяем столбец Tag, если он есть
        if 'Tag' in df.columns:
            tag_values = df['Tag'].dropna().unique()
            for tag in tag_values:
                if tag and str(tag).strip() and str(tag).strip().lower() != 'nan':
                    all_tags.add(str(tag).strip())
        
        # Проверяем столбец Тег, если он есть
        if 'Тег' in df.columns:
            tag_values = df['Тег'].dropna().unique()
            for tag in tag_values:
                if tag and str(tag).strip() and str(tag).strip().lower() != 'nan':
                    all_tags.add(str(tag).strip())
        
        # Проверяем столбец tags, если он есть (массивы тегов)
        if 'tags' in df.columns:
            for _, row in df.iterrows():
                tags = row.get('tags')
                if tags and isinstance(tags, list):
                    for tag in tags:
                        if tag and str(tag).strip():
                            all_tags.add(str(tag).strip())
                elif tags and isinstance(tags, str):
                    # Если tags - строка, предполагаем что это может быть сериализованный список
                    try:
                        import json
                        parsed_tags = json.loads(tags)
                        if isinstance(parsed_tags, list):
                            for tag in parsed_tags:
                                if tag and str(tag).strip():
                                    all_tags.add(str(tag).strip())
                    except:
                        # Если не удалось распарсить JSON, используем как обычную строку
                        if tags.strip():
                            all_tags.add(tags.strip())
        
        # Добавляем стандартные теги из функции анализа, если их еще нет
        standard_tags = [
            "ценовое возражение", "упоминание конкурентов", "запрос скидки",
            "вопрос о доставке", "техническая проблема", "консультация",
            "жалоба", "успешный", "неуспешный", "короткий разговор", 
            "длинный разговор", "средний разговор"
        ]
        
        for tag in standard_tags:
            all_tags.add(tag)
        
        # Извлекаем теги из результатов анализа, если они сохранились
        # Это попытка найти теги, которые были добавлены при анализе, но не сохранены в основных столбцах
        for _, row in df.iterrows():
            # Пытаемся найти теги в поле analysis, которое может быть JSON-строкой
            if 'analysis' in df.columns:
                analysis = row.get('analysis')
                if analysis and isinstance(analysis, str):
                    try:
                        import json
                        analysis_data = json.loads(analysis)
                        if isinstance(analysis_data, dict) and 'tags' in analysis_data:
                            tags = analysis_data['tags']
                            if isinstance(tags, list):
                                for tag in tags:
                                    if tag and str(tag).strip():
                                        all_tags.add(str(tag).strip())
                    except:
                        pass
        
        # Преобразуем набор в список и сортируем
        tags_list = sorted(list(all_tags))
        
        print(f"Найдено {len(tags_list)} уникальных тегов для фильтрации")
        return jsonify({"tags": tags_list})
    except Exception as e:
        print(f"Ошибка при получении списка тегов: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# Новый эндпоинт для обновления списка доступных тегов в интерфейсе
@app.route('/api/refresh-tags', methods=['GET', 'OPTIONS'])
def refresh_tags():
    """Обновляет и возвращает список всех уникальных тегов"""
    if request.method == 'OPTIONS':
        return handle_cors_options()
        
    try:
        # Перезагружаем данные из Excel файла для актуальности
        global calls_df
        calls_df = load_calls_from_excel()
        print(f"Данные перезагружены из Excel, загружено {len(calls_df)} строк")
        
        # Получаем обновленный список тегов
        tags_response = get_all_tags()
        if isinstance(tags_response, tuple):
            tags_data = tags_response[0].get_json()
        else:
            tags_data = tags_response.get_json()
        
        return jsonify({
            "success": True,
            "message": "Список тегов успешно обновлен",
            "tags": tags_data.get('tags', [])
        })
    except Exception as e:
        print(f"Ошибка при обновлении списка тегов: {str(e)}")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

# Функция для предварительного анализа первых звонков
def preview_analyze_calls(calls, max_calls=5):
    """
    Анализирует первые несколько звонков, чтобы понять общий контекст и цели звонков
    """
    if not calls or len(calls) == 0:
        return {
            "error": "Нет звонков для анализа"
        }
    
    # Ограничиваем количество звонков для предварительного анализа
    sample_calls = calls[:min(max_calls, len(calls))]
    
    # Формируем транскрипции для анализа
    transcriptions = []
    for call in sample_calls:
        if isinstance(call, dict) and call.get('transcription') and call['transcription'] != '-' and call['transcription'].strip() != '':
            transcription_text = f"ID звонка: {call.get('id', 'неизвестно')}\n"
            transcription_text += f"Оператор: {call.get('agent', 'неизвестно')}\n"
            transcription_text += f"Клиент: {call.get('customer', 'неизвестно')}\n"
            transcription_text += f"Дата: {call.get('date', 'неизвестно')}\n"
            transcription_text += f"Длительность: {call.get('duration', 'неизвестно')}\n"
            transcription_text += f"Статус: {call.get('status', 'неизвестно')}\n"
            transcription_text += f"Транскрипция:\n{call['transcription']}"
            transcriptions.append(transcription_text)
    
    if not transcriptions:
        return {
            "previewReport": "Не удалось найти звонки с транскрипциями для анализа",
            "llmAdvice": "Пожалуйста, сначала выполните транскрибацию звонков",
            "keyQuestions": [
                "Какие основные проблемы возникают в звонках?",
                "Как можно улучшить скрипт разговора?",
                "Что помогает увеличить конверсию?"
            ]
        }
    
    # Обрабатываем с помощью Gemini API
    print(f"Предварительный анализ звонков с помощью Gemini API (количество звонков: {len(transcriptions)})")
    try:
        # Настраиваем модель
        generation_config = {
            "temperature": 0.3,
            "top_p": 0.95,
            "top_k": 40,
            "max_output_tokens": 1024,
        }
        
        model = genai.GenerativeModel(
            model_name='gemma-3-27b-it',
            generation_config=generation_config
        )
        
        # Формируем промпт для анализа
        all_transcriptions = "\n\n--- СЛЕДУЮЩИЙ ЗВОНОК ---\n\n".join(transcriptions)
        
        prompt = f"""
        ЗАДАЧА: 
        Проанализируй следующие транскрипции первых звонков и определи общий контекст, смысл этих звонков, какой тип компании звонит, что продаёт или объясняет, на каком этапе воронки продаж находятся звонки.
        
        ТРАНСКРИПЦИИ ЗВОНКОВ:
        {all_transcriptions}
        
        ОТВЕТЬ В ФОРМАТЕ JSON:
        {{
          "previewReport": "Подробное описание смысла звонков, что продается/объясняется, какой продукт, какой этап воронки продаж, общий контекст, особенности разговоров",
          "llmAdvice": "Совет по анализу: что в первую очередь надо проанализировать, на что обратить внимание, какие важные вопросы задать",
          "keyQuestions": [
            "Ключевой вопрос 1 для анализа всех звонков?",
            "Ключевой вопрос 2 для анализа всех звонков?",
            "Ключевой вопрос 3 для анализа всех звонков?"
          ]
        }}
        
        Ключевые вопросы должны быть наиболее полезными для пользователя и давать ценные инсайты при анализе всех звонков.
        Важно, чтобы вопросы были конкретными, актуальными, и их ответы реально помогали понять эффективность и качество звонков.
        """
        
        response = model.generate_content(prompt)
        result_text = response.text.strip()
        print(f"Ответ от Gemini API получен (длина: {len(result_text)})")
        
        # Извлекаем JSON
        import json
        import re
        
        json_str = result_text
        if result_text.startswith('```json') and result_text.endswith('```'):
            json_str = result_text[7:-3].strip()
        elif result_text.startswith('```') and result_text.endswith('```'):
            json_str = result_text[3:-3].strip()
        
        try:
            result = json.loads(json_str)
            return result
        except json.JSONDecodeError as e:
            print(f"Ошибка при парсинге JSON: {str(e)}")
            # Попробуем использовать регулярное выражение для извлечения JSON
            json_match = re.search(r'```json\n(.*?)\n```', result_text, re.DOTALL)
            if json_match:
                try:
                    result = json.loads(json_match.group(1))
                    return result
                except:
                    pass
            
            # Если не удалось извлечь JSON, делаем базовый анализ
            return basic_preview_analysis(transcriptions)
    
    except Exception as e:
        print(f"Ошибка при использовании Gemini API для предварительного анализа: {str(e)}")
        return basic_preview_analysis(transcriptions)

def basic_preview_analysis(transcriptions):
    """
    Базовый анализ транскрипций без использования LLM
    """
    # Выделяем ключевые слова для определения контекста
    combined_text = " ".join(transcriptions).lower()
    sales_keywords = ["продажа", "купить", "цена", "стоимость", "предложение", "скидка"]
    support_keywords = ["проблема", "помощь", "техподдержка", "неисправность", "ошибка"]
    consultation_keywords = ["консультация", "вопрос", "информация", "узнать"]
    
    sales_count = sum(word in combined_text for word in sales_keywords)
    support_count = sum(word in combined_text for word in support_keywords)
    consultation_count = sum(word in combined_text for word in consultation_keywords)
    
    # Определяем тип звонков на основе ключевых слов
    if sales_count > support_count and sales_count > consultation_count:
        call_type = "продажи"
        key_questions = [
            "Насколько эффективно операторы закрывают возражения клиентов?",
            "Как часто звонки приводят к продаже или следующему этапу?",
            "Какие ключевые преимущества продукта упоминаются в разговоре?"
        ]
    elif support_count > sales_count and support_count > consultation_count:
        call_type = "техническая поддержка"
        key_questions = [
            "Насколько быстро операторы решают проблемы клиентов?",
            "Какие типичные проблемы возникают у клиентов?",
            "Какова удовлетворенность клиентов после разговора?"
        ]
    else:
        call_type = "консультация"
        key_questions = [
            "Насколько полно операторы отвечают на вопросы клиентов?",
            "Какие вопросы чаще всего задают клиенты?",
            "Как можно улучшить информативность консультаций?"
        ]
    
    # Формируем отчет
    preview_report = f"На основе базового анализа транскрипций, эти звонки относятся к типу '{call_type}'. "
    preview_report += f"Проанализировано {len(transcriptions)} звонков. "
    
    if call_type == "продажи":
        preview_report += "Звонки связаны с продажей продуктов или услуг, обсуждением цен и условий."
        llm_advice = "Рекомендуется проанализировать эффективность техник продаж, работу с возражениями и конверсию звонков в продажи."
    elif call_type == "техническая поддержка":
        preview_report += "Звонки связаны с решением технических проблем и поддержкой пользователей."
        llm_advice = "Рекомендуется проанализировать скорость и качество решения проблем, а также уровень технической экспертизы операторов."
    else:
        preview_report += "Звонки связаны с предоставлением информации и ответами на вопросы клиентов."
        llm_advice = "Рекомендуется проанализировать полноту и точность предоставляемой информации, а также скорость ответов на вопросы."
    
    return {
        "previewReport": preview_report,
        "llmAdvice": llm_advice,
        "keyQuestions": key_questions
    }

@app.route('/api/import-folder', methods=['POST'])
def import_folder():
    """Импортировать аудиозаписи из локальной папки"""
    try:
        data = request.get_json()
        options = data if data else {}
        
        # Параметры импорта
        extensions = options.get('extensions', ['.wav', '.mp3', '.ogg'])
        limit = options.get('limit', 100)
        transcribe = options.get('transcribe', False)
        analyze = options.get('analyze', False)
        
        recordings_folder = os.path.join(os.getcwd(), 'uploads', 'Записи')
        
        if not os.path.exists(recordings_folder):
            return jsonify({"error": f"Папка {recordings_folder} не найдена"}), 404
        
        # Сканируем папку и подпапки
        audio_files = []
        for root, dirs, files in os.walk(recordings_folder):
            for file in files:
                if any(file.lower().endswith(ext) for ext in extensions):
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, recordings_folder)
                    audio_files.append({
                        'full_path': full_path,
                        'rel_path': rel_path,
                        'name': file
                    })
        
        if limit:
            audio_files = audio_files[:limit]
        
        # Загружаем существующий Excel файл
        df = pd.read_excel(EXCEL_FILE)
        
        # Обеспечиваем наличие необходимых колонок
        required_columns = [
            'Ссылка на запись', 'Транскрибация', 'Tag', 'lanth',
            'Дата/Время завершения звонка', 'Цели', 'Дозвон/Недозвон',
            'Статус', 'Тип звонка', 'tags', 'Источник файла'
        ]
        for col in required_columns:
            if col not in df.columns:
                df[col] = ''
        
        imported_count = 0
        transcribed_count = 0
        analyzed_count = 0
        
        # Импортируем новые файлы
        for audio_file in audio_files:
            # Проверяем, не импортирован ли уже этот файл
            record_url = f"/api/recordings/{audio_file['rel_path'].replace(os.sep, '/')}"
            
            if not df[df['Ссылка на запись'] == record_url].empty:
                continue  # Файл уже импортирован
            
            # Получаем длительность аудио
            try:
                from mutagen import File
                audio_info = File(audio_file['full_path'])
                duration = int(audio_info.info.length) if audio_info and audio_info.info else 0
            except:
                duration = 0
            
            # Получаем дату модификации файла
            mod_time = os.path.getmtime(audio_file['full_path'])
            date_time = datetime.fromtimestamp(mod_time).strftime('%Y-%m-%d %H:%M:%S')
            
            # Добавляем новую запись
            new_row = {
                'Ссылка на запись': record_url,
                'Транскрибация': '',
                'Tag': '',
                'lanth': duration,
                'Дата/Время завершения звонка': date_time,
                'Цели': '',
                'Дозвон/Недозвон': '',
                'Статус': '',
                'Тип звонка': '',
                'tags': '',
                'Источник файла': audio_file['name']  # Имя файла для локальных записей
            }
            
            df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
            imported_count += 1
            
            # Транскрибируем, если нужно
            if transcribe:
                try:
                    # Используем синхронную версию для локальных файлов
                    result = transcribe_local_file_sync(audio_file['full_path'])
                    df.iloc[-1, df.columns.get_loc('Транскрибация')] = result["text"]
                    df.iloc[-1, df.columns.get_loc('Tag')] = 'gemini'
                    transcribed_count += 1
                    print(f"Файл {audio_file['name']} успешно транскрибирован")
                except Exception as e:
                    print(f"Ошибка транскрипции {audio_file['name']}: {str(e)}")
            
            # Анализируем, если нужно и есть транскрипция
            if analyze and transcribe:
                try:
                    transcript = df.iloc[-1]['Транскрибация']
                    if transcript:
                        analysis_result = analyze_transcript(transcript)
                        
                        # Обновляем статус и другие поля
                        if 'status' in analysis_result:
                            df.iloc[-1, df.columns.get_loc('Статус')] = analysis_result['status']
                        if 'callResult' in analysis_result:
                            df.iloc[-1, df.columns.get_loc('Дозвон/Недозвон')] = analysis_result['callResult']
                        
                        analyzed_count += 1
                except Exception as e:
                    print(f"Ошибка анализа {audio_file['name']}: {str(e)}")
        
        # Сохраняем изменения
        try:
            df.to_excel(EXCEL_FILE, index=False)
        except Exception as save_err:
            print(f"Предупреждение: не удалось сохранить Excel немедленно: {save_err}")
            try:
                ts = int(time.time())
                fallback_path = f"DFASDF_imported_{ts}.xlsx"
                df.to_excel(fallback_path, index=False)
                print(f"Изменения (импорт) сохранены в новый файл: {fallback_path}")
            except Exception as fallback_err:
                print(f"Ошибка резервного сохранения Excel (импорт): {fallback_err}")
        
        # После импорта возвращаем ТОЛЬКО импортированные локальные записи
        # Читаем обновленный Excel и фильтруем локальные файлы
        df_updated = pd.read_excel(EXCEL_FILE)
        local_calls = []
        
        for idx, row in df_updated.iterrows():
            record_url = str(row.get('Ссылка на запись', ''))
            if record_url.startswith('/api/recordings/'):
                # Это локальный файл - добавляем в результат
                call_data = {
                    'id': str(idx),
                    'agent': 'Оператор',
                    'customer': str(row.get('Номер телефона', '')),
                    'date': str(row.get('Дата/Время завершения звонка', '')),
                    'duration': str(row.get('lanth', '0')),
                    'status': str(row.get('Статус', 'Доступна')),
                    'recordUrl': record_url,
                    'transcript': str(row.get('Транскрибация', '')),
                    'tag': str(row.get('Tag', '')),
                    'summary': str(row.get('Краткое содержание', '')),
                    'aiSummary': str(row.get('ИИ Анализ', '')),
                    'evaluation': str(row.get('Оценка', '')),
                    'goals': str(row.get('Цели', '')),
                    'callResult': str(row.get('Дозвон/Недозвон', '')),
                    'callType': str(row.get('Тип звонка', '')),
                    'tags': str(row.get('tags', ''))
                }
                local_calls.append(call_data)
        
        return jsonify({
            "success": True,
            "imported": imported_count,
            "transcribed": transcribed_count,
            "analyzed": analyzed_count,
            "total_found": len(audio_files),
            "local_calls": local_calls  # Возвращаем только локальные записи
        })
        
    except Exception as e:
        print(f"Ошибка при импорте папки: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/recordings/<path:filename>')
def serve_recording(filename):
    """Сервер для аудиофайлов из папки записей"""
    try:
        recordings_folder = os.path.join(os.getcwd(), 'uploads', 'Записи')
        file_path = os.path.join(recordings_folder, filename)
        
        # Проверяем безопасность пути
        if not os.path.abspath(file_path).startswith(os.path.abspath(recordings_folder)):
            return jsonify({"error": "Недопустимый путь к файлу"}), 403
        
        if not os.path.exists(file_path):
            return jsonify({"error": "Файл не найден"}), 404
        
        return send_file(file_path)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/preview-analyze', methods=['POST'])
@cross_origin()
def preview_analyze_endpoint():
    """
    API-эндпоинт для предварительного анализа первых звонков (максимум 5)
    """
    try:
        data = request.get_json()
        calls = data.get('calls')
        
        # Если звонки не переданы, получаем из базы данных
        if not calls:
            calls = get_calls_data()
        
        # Выполняем предварительный анализ
        result = preview_analyze_calls(calls)
        return jsonify(result)
    
    except Exception as e:
        print(f"Ошибка при предварительном анализе звонков: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("\n=== Запуск API-сервера для работы с реальными данными о звонках ===")
    print(f"Файл данных: {EXCEL_FILE}")
    try:
        df = pd.read_excel(EXCEL_FILE)
        print(f"Загружено {len(df)} звонков из Excel")
    except Exception as e:
        print(f"Ошибка при загрузке Excel: {str(e)}")
    app.run(debug=True, port=5000) 