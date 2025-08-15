import asyncio
from main import batch_transcribe

async def process_table():
    # Предположим, что у вас есть список URLs из таблицы
    urls_from_table = [
        "https://storage.yandexcloud.net/k8srecords/1.mp3",
        "https://storage.yandexcloud.net/k8srecords/2.mp3",
        # ... другие URLs
    ]
    
    # Вызываем batch_transcribe с URLs из таблицы
    results = await batch_transcribe(urls_from_table)
    
    # Обрабатываем результаты
    for result in results:
        if result["status"] == "success":
            # Здесь можно сохранить транскрипцию в таблицу
            url = result["url"]
            transcription = result["text"]
            print(f"Processed {url}: {transcription}")
        else:
            print(f"Error processing {result['url']}: {result['error']}")

if __name__ == "__main__":
    asyncio.run(process_table())