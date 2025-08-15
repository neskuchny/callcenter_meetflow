from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Разрешаем кросс-доменные запросы

@app.route('/api/calls', methods=['GET'])
def get_calls():
    """Тестовый эндпоинт для проверки работы API"""
    # Возвращаем тестовые данные
    calls = [
        {
            'id': '1',
            'agent': 'Оператор',
            'customer': '79123456789',
            'date': '01.01.2025',
            'time': '12:00',
            'duration': '1м 30с',
            'status': 'успешный',
            'purpose': 'Консультация',
            'transcription': 'Тестовая транскрипция',
            'recordUrl': 'https://example.com/record/1',
            'aiSummary': 'Тестовый анализ',
            'keyInsight': 'Тестовый вывод',
            'recommendation': 'Тестовая рекомендация',
            'score': 8
        },
        {
            'id': '2',
            'agent': 'Оператор 2',
            'customer': '79234567890',
            'date': '02.01.2025',
            'time': '13:15',
            'duration': '2м 45с',
            'status': 'неуспешный',
            'purpose': 'Возврат товара',
            'transcription': 'Клиент: Хочу вернуть товар. Оператор: К сожалению, срок возврата истек.',
            'recordUrl': 'https://example.com/record/2',
            'aiSummary': 'Клиент пытался вернуть товар после истечения гарантийного срока',
            'keyInsight': 'Необходимо улучшить информирование о гарантийных условиях',
            'recommendation': 'Добавить уведомления о приближении конца гарантийного срока',
            'score': 3
        },
        {
            'id': '3',
            'agent': 'Оператор 3',
            'customer': '79345678901',
            'date': '03.01.2025',
            'time': '14:30',
            'duration': '5м 10с',
            'status': 'требует внимания',
            'purpose': 'Техническая поддержка',
            'transcription': 'Клиент: У меня не работает устройство. Оператор: Давайте попробуем перезагрузить.',
            'recordUrl': 'https://example.com/record/3',
            'aiSummary': 'Клиент столкнулся с техническими проблемами, требуется дополнительная консультация',
            'keyInsight': 'Сложность объяснения технических деталей',
            'recommendation': 'Создать визуальные инструкции для типовых проблем',
            'score': 5
        }
    ]
    return jsonify({"calls": calls})

@app.route('/api/analyze', methods=['POST'])
def analyze_calls():
    """Тестовый эндпоинт для анализа звонков"""
    return jsonify({"calls": [
        {
            'id': '1',
            'aiSummary': 'Успешная консультация клиента по продукту',
            'keyInsight': 'Клиент заинтересован в дополнительной информации',
            'recommendation': 'Предложить сопутствующие товары',
            'score': 9
        },
        {
            'id': '2',
            'aiSummary': 'Клиент недоволен отказом в возврате',
            'keyInsight': 'Необходимо улучшить информирование о условиях возврата',
            'recommendation': 'Обновить раздел FAQ на сайте',
            'score': 4
        }
    ]})

@app.route('/api/transcribe', methods=['POST'])
def transcribe_calls():
    """Тестовый эндпоинт для транскрибации звонков"""
    return jsonify({"calls": [
        {
            'id': '1',
            'transcription': 'Оператор: Здравствуйте! Чем могу помочь?\nКлиент: Здравствуйте, интересует ваш товар.\nОператор: Конечно, расскажу подробнее...',
            'status': 'success'
        },
        {
            'id': '2',
            'transcription': 'Оператор: Добрый день!\nКлиент: Мне нужна помощь с настройкой.\nОператор: Давайте разберемся с этим вопросом...',
            'status': 'success'
        }
    ]})

@app.route('/api/process', methods=['POST'])
def process_all():
    """Тестовый эндпоинт для обработки всех звонков"""
    return jsonify({
        "message": "Обработано 15 звонков",
        "success": 12,
        "failed": 3
    })

if __name__ == '__main__':
    print("Запуск тестового API-сервера на порту 5000...")
    app.run(debug=True, port=5000) 