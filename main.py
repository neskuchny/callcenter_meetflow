import os
import asyncio
import aiohttp
import argparse
from groq import Groq
from typing import List, Dict
from dotenv import load_dotenv

load_dotenv()

# Initialize the Groq client
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

async def download_audio(session: aiohttp.ClientSession, url: str) -> tuple[str, bytes]:
    """Асинхронно загружает аудиофайл по URL"""
    async with session.get(url) as response:
        return url, await response.read()

async def transcribe_audio(audio_content: bytes, url: str) -> Dict:
    """Транскрибирует отдельный аудиофайл"""
    try:
        transcription = await asyncio.to_thread(
            client.audio.transcriptions.create,
            file=(os.path.basename(url), audio_content),
            model="whisper-large-v3-turbo",
            response_format="json",
            language="ru",
            temperature=0.0
        )
        return {
            "url": url,
            "text": transcription.text,
            "status": "success"
        }
    except Exception as e:
        return {
            "url": url,
            "text": None,
            "status": "error",
            "error": str(e)
        }

async def batch_transcribe(urls: List[str]) -> List[Dict]:
    """
    Асинхронно транскрибирует пачку аудиофайлов по их URL
    
    Args:
        urls: Список URL-адресов аудиофайлов
        
    Returns:
        List[Dict]: Список результатов транскрипции
    """
    async with aiohttp.ClientSession() as session:
        # Загружаем все файлы асинхронно
        download_tasks = [download_audio(session, url) for url in urls]
        downloaded_files = await asyncio.gather(*download_tasks)
        
        # Транскрибируем все файлы
        transcribe_tasks = [
            transcribe_audio(content, url)
            for url, content in downloaded_files
        ]
        results = await asyncio.gather(*transcribe_tasks)
    
    return results

async def main(urls: List[str]):
    if not urls:
        print("Please provide at least one URL")
        return
    
    results = await batch_transcribe(urls)
    for result in results:
        if result["status"] == "success":
            print(f"Transcription for {result['url']}:")
            print(result["text"])
            print("-" * 50)
        else:
            print(f"Error processing {result['url']}:")
            print(f"Error: {result['error']}")
            print("-" * 50)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Transcribe audio files from URLs')
    parser.add_argument('urls', nargs='*', help='URLs of audio files to transcribe')
    parser.add_argument('-f', '--file', help='File containing URLs (one per line)')
    
    args = parser.parse_args()
    
    urls = []
    if args.file:
        with open(args.file, 'r') as f:
            urls.extend(line.strip() for line in f if line.strip())
    
    urls.extend(args.urls)
    
    if not urls:
        print("No URLs provided. Please provide URLs as arguments or through a file.")
        parser.print_help()
        exit(1)
    
    asyncio.run(main(urls))