import pandas as pd
import asyncio
import aiohttp
import mutagen
from mutagen.mp3 import MP3
import io
import time
from concurrent.futures import ThreadPoolExecutor

async def get_audio_length(session, url):
    try:
        async with session.get(url) as response:
            if response.status == 200:
                # Читаем аудиофайл в память
                audio_data = await response.read()
                # Используем BytesIO для работы с данными в памяти
                audio_file = io.BytesIO(audio_data)
                # Определяем длительность через mutagen
                audio = MP3(audio_file)
                duration = audio.info.length
                # Форматируем в мм:сс
                minutes = int(duration // 60)
                seconds = int(duration % 60)
                return f"{minutes:02d}.{seconds:02d}"
    except Exception as e:
        print(f"Error processing {url}: {e}")
        return None

async def process_batch(session, urls, start_idx):
    tasks = []
    for url in urls:
        if isinstance(url, str):
            tasks.append(get_audio_length(session, url))
        else:
            tasks.append(None)
    return await asyncio.gather(*tasks)

async def process_excel():
    # Читаем Excel файл
    df = pd.read_excel("DFASDF.xlsx")
    total_duration = 0
    batch_size = 1000
    
    # Создаем сессию для асинхронных запросов
    async with aiohttp.ClientSession() as session:
        for start_idx in range(0, len(df), batch_size):
            batch_end = min(start_idx + batch_size, len(df))
            print(f"\nОбработка записей {start_idx+1} - {batch_end} из {len(df)}")
            
            # Получаем URLs для текущего батча
            batch_urls = df['Ссылка на запись'].iloc[start_idx:batch_end]
            
            # Обрабатываем батч
            batch_start_time = time.time()
            results = await process_batch(session, batch_urls, start_idx)
            
            # Обновляем DataFrame для текущего батча
            df.loc[start_idx:batch_end-1, 'lanth'] = results
            
            # Подсчитываем длительность батча
            batch_duration = 0
            for duration in results:
                if duration:
                    minutes, seconds = map(int, duration.split('.'))
                    batch_duration += minutes * 60 + seconds
                    total_duration += minutes * 60 + seconds
            
            # Сохраняем промежуточные результаты
            df.to_excel("DFASDF_updated.xlsx", index=False)
            
            # Выводим статистику батча
            batch_hours = batch_duration // 3600
            batch_minutes = (batch_duration % 3600) // 60
            batch_seconds = batch_duration % 60
            batch_time = time.time() - batch_start_time
            print(f"Длительность батча: {batch_hours}:{batch_minutes:02d}:{batch_seconds:02d}")
            print(f"Время обработки батча: {batch_time:.2f} секунд")
    
    # Выводим общую статистику
    total_hours = total_duration // 3600
    total_minutes = (total_duration % 3600) // 60
    total_seconds = total_duration % 60
    print(f"\nОбщая длительность всех записей: {total_hours}:{total_minutes:02d}:{total_seconds:02d}")

if __name__ == "__main__":
    start_time = time.time()
    asyncio.run(process_excel())
    print(f"Общее время выполнения: {time.time() - start_time:.2f} секунд")
