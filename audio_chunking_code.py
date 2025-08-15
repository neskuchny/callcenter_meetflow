from groq import AsyncGroq, RateLimitError
# Удаляем импорт pydub
# from pydub import AudioSegment
import json
import subprocess
from pathlib import Path
import time
import os
import tempfile
import random
import asyncio
import base64
from typing import List, Tuple, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

# Импорт зависимости для Google Gemini API
try:
    import google.generativeai as genai
except ImportError:
    print("ВНИМАНИЕ: Модуль google.generativeai не установлен. Транскрибация через Gemini будет недоступна.")

# Новые вспомогательные функции для работы с ffmpeg
def get_audio_duration(file_path):
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
        raise Exception(f"Ошибка при получении длительности аудио: {result.stderr}")
    
    duration_str = result.stdout.strip()
    
    # Обрабатываем случай, когда ffprobe возвращает 'N/A' или пустую строку
    if not duration_str or duration_str.lower() == 'n/a':
        print(f"Предупреждение: ffprobe не смог определить длительность для {file_path}, используем длительность по умолчанию 5 секунд")
        return 5000  # Возвращаем 5 секунд в миллисекундах по умолчанию
    
    try:
        duration_sec = float(duration_str)
        return int(duration_sec * 1000)  # Конвертируем в миллисекунды
    except ValueError as e:
        print(f"Предупреждение: не удалось преобразовать длительность '{duration_str}' в число для файла {file_path}, используем длительность по умолчанию 5 секунд")
        return 5000  # Возвращаем 5 секунд в миллисекундах по умолчанию

def extract_audio_segment(input_file, output_file, start_ms, duration_ms):
    """
    Извлекает сегмент аудио из входного файла и сохраняет в формате WAV 16kHz
    
    Args:
        input_file: Путь к входному аудиофайлу
        output_file: Путь для сохранения выходного файла
        start_ms: Начальная позиция в миллисекундах
        duration_ms: Длительность сегмента в миллисекундах
    """
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

# Функция для транскрибации через Gemini
async def transcribe_with_gemini(chunk_file: Path, chunk_num: int, total_chunks: int) -> tuple[dict, float]:
    """
    Транскрибирует аудиофрагмент с использованием Google Gemini API.
    
    Args:
        chunk_file: Путь к файлу аудиофрагмента.
        chunk_num: Номер текущего фрагмента (для отслеживания прогресса).
        total_chunks: Общее количество фрагментов (для отслеживания прогресса).
        
    Returns:
        Кортеж, содержащий результат транскрипции (словарь) и время обработки (float).
    """
    api_key = os.getenv("GOOGLE_GEMINI_API_KEY")
    if not api_key:
        raise ValueError("Переменная окружения GOOGLE_GEMINI_API_KEY не установлена")
    
    genai.configure(api_key=api_key)
    
    total_api_time = 0
    max_retries = 5
    retry_count = 0
    base_delay = 5
    
    while True:
        start_time = time.time()
        try:
            # Чтение аудиофайла
            with open(chunk_file, 'rb') as f:
                audio_file_bytes = f.read()
            
            # Используем GenerativeModel для создания запроса
            model = genai.GenerativeModel('gemini-2.0-flash')
            response = model.generate_content(
                contents=[
                    'Transcribe audio, Return only text in audio language without additional comments.',
                    {
                        'mime_type': 'audio/wav',
                        'data': audio_file_bytes
                    }
                ]
            )
            
            api_time = time.time() - start_time
            total_api_time += api_time
            
            print(f"Фрагмент {chunk_num}/{total_chunks} обработан через Gemini за {api_time:.2f}с")
            
            # Формируем результат в том же формате, как у Groq
            result = {"text": response.text}
            
            return result, total_api_time
            
        except Exception as e:
            retry_count += 1
            delay = min(60, base_delay * (2 ** (retry_count - 1))) * (0.9 + 0.2 * random.random())
            print(f"\nОшибка запроса Gemini для фрагмента {chunk_num} - повторная попытка через {delay:.1f} секунд (попытка {retry_count}/{max_retries})...")
            
            if retry_count > max_retries:
                print(f"Максимальное количество попыток для фрагмента {chunk_num} превышено")
                raise
                
            await asyncio.sleep(delay)
            continue

async def transcribe_single_chunk(client: AsyncGroq, chunk_file: Path, chunk_num: int, total_chunks: int) -> tuple[dict, float]:
    """
    Транскрибирует один аудиофрагмент с использованием API Groq.

    Args:
        client: Клиент API Groq
        chunk_file: Путь к файлу аудиофрагмента.
        chunk_num: Номер текущего фрагмента для отчетности.
        total_chunks: Общее количество фрагментов для отчетности.

    Returns:
        Кортеж, содержащий результат транскрипции (словарь) и время обработки (float).
    """
    total_api_time = 0
    max_retries = 5 # Максимальное количество попыток отправки запроса при ошибке
    retry_count = 0
    base_delay = 5 # Начальная задержка перед повторной попыткой (в секундах)

    while True: # Бесконечный цикл, пока транскрипция не будет успешной или не превысит лимит попыток
        start_time = time.time()
        try:
            # Открываем файл аудиофрагмента напрямую
            with open(chunk_file, "rb") as audio_file:
                result = await client.audio.transcriptions.create(
                    file=("chunk.wav", audio_file, "audio/wav"),  # Изменено на WAV
                    model="whisper-large-v3-turbo", # Используем модель Whisper от Groq
                    response_format="verbose_json" # Запрашиваем подробный JSON ответ
                )
            api_time = time.time() - start_time
            total_api_time += api_time

            print(f"Фрагмент {chunk_num}/{total_chunks} обработан через Groq за {api_time:.2f}с")
            return result, total_api_time # Возвращаем результат и время обработки

        except RateLimitError as e: # Обработка ошибки RateLimitError от Groq API
            retry_count += 1
            # Экспоненциальная задержка между повторными попытками с добавлением случайности.
            delay = min(60, base_delay * (2 ** (retry_count - 1))) * (0.9 + 0.2 * random.random())
            print(f"\nПревышен лимит запросов для фрагмента {chunk_num} - повторная попытка через {delay:.1f} секунд (попытка {retry_count}/{max_retries})...")

            if retry_count > max_retries: # Если превышено максимальное количество попыток
                print(f"Максимальное количество попыток для фрагмента {chunk_num} превышено")
                raise # Выбрасываем исключение, чтобы остановить процесс

            await asyncio.sleep(delay) # Асинхронная пауза перед следующей попыткой
            continue # Переходим к следующей итерации цикла while

        except Exception as e: # Обработка любых других ошибок при транскрипции
            print(f"Ошибка при транскрибации фрагмента {chunk_num}: {str(e)}")
            raise # Выбрасываем исключение, чтобы остановить процесс

def merge_transcripts(results: list[tuple[dict, int]]) -> str:
    """
    Упрощенная функция для объединения результатов транскрипции из разных фрагментов.

    Args:
        results: Список кортежей, где каждый кортеж содержит результат транскрипции (словарь) и время начала фрагмента.

    Returns:
        Объединенный текст транскрипции (строка).
    """
    full_text = ""

    for result, _ in results: # Итерируемся по результатам транскрипции фрагментов
        if isinstance(result, dict) and 'text' in result: # Проверяем, что результат - словарь и содержит текст
            full_text += " " + result['text'] # Добавляем текст фрагмента к общему тексту
        elif hasattr(result, 'text'): # Альтернативный способ доступа к тексту, если результат - объект с атрибутом 'text'
            full_text += " " + result.text

    return full_text.strip() # Возвращаем объединенный текст, убрав пробелы в начале и конце

async def transcribe_audio_in_chunks(audio_path: Path, chunk_length: int = 600, overlap: int = 10,
                                    max_concurrent: int = 5, user_region: Optional[str] = None) -> str:
    """
    Асинхронная транскрипция аудиофайла с разбивкой на фрагменты и параллельной обработкой.
    Используется ffmpeg вместо pydub для более эффективного использования памяти.

    Args:
        audio_path: Путь к аудиофайлу.
        chunk_length: Длина каждого фрагмента в секундах (по умолчанию 600 секунд = 10 минут).
        overlap: Перекрытие между фрагментами в секундах (по умолчанию 10 секунд).
        max_concurrent: Максимальное количество параллельных запросов к API (ограничение для избежания перегрузки).
        user_region: Регион пользователя для выбора сервиса транскрипции.

    Returns:
        Итоговый транскрибированный текст (строка).
    """
    # Определяем, какой сервис использовать для транскрипции
    use_gemini = False
    api_key = None  # Инициализируем api_key как None
    
    if user_region and user_region.lower() in ['uz', 'kz', 'kg']:
        print(f"Обнаружен регион {user_region}, будем использовать Gemini API для транскрипции")
        use_gemini = True
        api_key = os.getenv("GOOGLE_GEMINI_API_KEY")
        
    if use_gemini and not api_key:
            print("ВНИМАНИЕ: GOOGLE_GEMINI_API_KEY не установлен, переключаемся на Groq API")
            use_gemini = False
    
    # Инициализируем клиент Groq API, если используем Groq
    client = None
    if not use_gemini:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("Переменная окружения GROQ_API_KEY не установлена")
        client = AsyncGroq(api_key=api_key)

    print(f"\nНачинаем транскрипцию: {audio_path} через {('Gemini API' if use_gemini else 'Groq API')}")

    try:
        # Получаем длительность аудио с помощью ffprobe
        duration = get_audio_duration(audio_path)
        print(f"Длительность аудио: {duration/1000:.2f}с")

        # Адаптация размера фрагмента для коротких аудиофайлов.
        if duration < 10000:  # Если аудио меньше 10 секунд
            chunk_length = max(1, int(duration/1000))  # Устанавливаем длину фрагмента в 1 секунду (минимум) или равной длительности аудио
            overlap = 0 # Убираем перекрытие для коротких аудио
            print(f"Обнаружено короткое аудио, размер фрагмента установлен в {chunk_length}с")

        # Расчет параметров фрагментации.
        chunk_ms = chunk_length * 1000 # Длина фрагмента в миллисекундах
        overlap_ms = overlap * 1000 # Перекрытие в миллисекундах
        total_chunks = max(1, (duration // (chunk_ms - overlap_ms)) + (1 if duration % (chunk_ms - overlap_ms) > 0 else 0)) # Вычисляем общее количество фрагментов
        print(f"Обрабатываем {total_chunks} фрагментов, параллельно до {max_concurrent} фрагментов...")

        # Создаем временную директорию для хранения фрагментов
        temp_dir = Path(tempfile.mkdtemp())
        print(f"Создана временная директория для фрагментов: {temp_dir}")

        # Подготовка данных для фрагментации.
        chunk_data = []

        for i in range(total_chunks):
            start = i * (chunk_ms - overlap_ms) # Вычисляем время начала фрагмента
            end = min(start + chunk_ms, duration) # Вычисляем время окончания фрагмента (не выходит за конец аудио)
            duration_ms = end - start

            print(f"Подготавливаем фрагмент {i+1}/{total_chunks}: {start/1000:.1f}с - {end/1000:.1f}с")

            # Создаем уникальное имя для файла фрагмента
            chunk_file = temp_dir / f"chunk_{i:03d}.wav"
            
            # Извлекаем сегмент и конвертируем его в WAV 16kHz
            extract_audio_segment(audio_path, chunk_file, start, duration_ms)
            
            # Добавляем данные о фрагменте в список
            chunk_data.append((i, start, chunk_file))

        # Запуск задач транскрипции с ограничением параллельности.
        semaphore = asyncio.Semaphore(max_concurrent) # Семафор для контроля количества параллельных задач
        start_time = time.time() # Засекаем время начала обработки

        async def process_chunk(idx, start_ms, chunk_file): # Асинхронная функция для обработки одного фрагмента
            async with semaphore: # Используем семафор для ограничения параллельности
                try:
                    # Используем соответствующую функцию транскрипции в зависимости от выбранного API
                    if use_gemini:
                        result, _ = await transcribe_with_gemini(chunk_file, idx+1, total_chunks)
                    else:
                        result, _ = await transcribe_single_chunk(client, chunk_file, idx+1, total_chunks)

                    # Вывод прогресса обработки.
                    completed = idx + 1 # Количество обработанных фрагментов
                    elapsed = time.time() - start_time # Прошедшее время
                    if completed > 1: # Начинаем показывать оценку времени после обработки первого фрагмента
                        remaining = (elapsed / completed) * (total_chunks - completed) # Оценка оставшегося времени
                        print(f"\nПрогресс: {completed}/{total_chunks} фрагментов ({(completed/total_chunks)*100:.1f}% выполнено)")
                        print(f"Ориентировочное время до завершения: {remaining/60:.1f} минут")

                    return idx, result, start_ms # Возвращаем индекс, результат и время начала фрагмента
                except Exception as e: # Обработка ошибок внутри асинхронной задачи
                    print(f"Ошибка при обработке фрагмента {idx+1}: {str(e)}")
                    raise # Пробрасываем исключение

        # Создаем список задач для асинхронного выполнения.
        tasks = [process_chunk(idx, start_ms, chunk_file) for idx, start_ms, chunk_file in chunk_data]
        chunk_results = await asyncio.gather(*tasks) # Запускаем все задачи параллельно и ждем их завершения

        # Очистка временных файлов
        try:
            for _, _, chunk_file in chunk_data:
                if chunk_file.exists():
                    os.remove(chunk_file)
            os.rmdir(temp_dir)
        except Exception as e:
            print(f"Ошибка при удалении временных файлов: {str(e)}")

        # Сортируем результаты по индексу, чтобы восстановить порядок фрагментов.
        sorted_results = sorted(chunk_results, key=lambda x: x[0])
        results_for_merge = [(result, start_ms) for _, result, start_ms in sorted_results] # Извлекаем результаты и время начала

        # Объединяем результаты транскрипции в один текст.
        final_result = merge_transcripts(results_for_merge)

        return final_result # Возвращаем итоговый транскрибированный текст

    except Exception as e: # Обработка ошибок на верхнем уровне функции
        print(f"Ошибка во время транскрипции: {str(e)}")
        raise # Пробрасываем исключение

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1: # Если передан аргумент командной строки
        input_file = Path(sys.argv[1]) # Используем переданный путь к файлу
    else:
        input_file = Path("backend/test_audio.ogg") # Путь к тестовому аудиофайлу по умолчанию

    if not input_file.exists(): # Проверка существования входного файла
        print(f"Файл {input_file} не найден!")
        sys.exit(1) # Завершаем программу с кодом ошибки 1
    
    # Для тестирования, можно указать регион пользователя
    test_region = os.getenv("TEST_REGION", "uz")  # Например, 'uz', 'kz', 'kg'

    start_time = time.time() # Засекаем общее время начала транскрипции

    # Запускаем асинхронную функцию транскрибации.
    result = asyncio.run(transcribe_audio_in_chunks(
        input_file,
        chunk_length=60,  # Уменьшаем размер фрагмента до 60 секунд (1 минута) для теста
        overlap=5,        # Уменьшаем перекрытие между фрагментами до 5 секунд для теста
        max_concurrent=3,  # Ограничиваем количество параллельных запросов до 3 для теста
        user_region=test_region  # Передаем регион пользователя
    ))

    total_time = time.time() - start_time # Вычисляем общее время транскрипции

    print(f"\n============ РЕЗУЛЬТАТ ТРАНСКРИПЦИИ ============")
    print(f"Файл: {input_file}")
    print(f"Время обработки: {total_time:.1f} секунд ({total_time/60:.1f} минут)")
    print(f"Длина результата: {len(result)} символов")
    print(f"============================================")
    print(result) # Выводим результат транскрипции на экран

    # Сохраняем результат в текстовый файл.
    output_file = input_file.with_suffix('.txt') # Создаем имя файла для сохранения, меняя расширение на .txt
    with open(output_file, 'w', encoding='utf-8') as f: # Открываем файл на запись в кодировке UTF-8
        f.write(result) # Записываем результат транскрипции в файл

    print(f"\nРезультат сохранен в {output_file}") # Сообщаем о сохранении результата 