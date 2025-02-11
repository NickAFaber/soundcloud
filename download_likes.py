import os

USER = ""
ARCHIVE = "D:/Music/likes.txt"
OUTPUT = "D:/Music/Likes/%(uploader)s/%(title)s.%(ext)s"
URL = f"https://soundcloud.com/{USER}/likes"

# --http-chunk-size 10M --limit-rate 1M --no-overwrites 
cmd = f'yt-dlp --sleep-requests 2 --sleep-interval 2 --ignore-errors --continue --format bestaudio --cookies-from-browser firefox --audio-format best --audio-quality 0 --add-metadata --embed-thumbnail --download-archive {ARCHIVE} --output {OUTPUT} {URL}'
os.system(cmd)