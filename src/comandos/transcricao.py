import sys
import json
from faster_whisper import WhisperModel

video_path = sys.argv[1]

model = WhisperModel('tiny', device='cpu', compute_type='int8')
segments, info = model.transcribe(video_path, word_timestamps=True, language='pt')

result = {
    'language': info.language,
    'duration': round(info.duration, 2),
    'segments': []
}

for seg in segments:
    words = []
    if seg.words:
        words = [{'word': w.word.strip(), 'start': round(w.start, 2), 'end': round(w.end, 2)} for w in seg.words]
    result['segments'].append({
        'start': round(seg.start, 2),
        'end': round(seg.end, 2),
        'text': seg.text.strip(),
        'words': words
    })

print(json.dumps(result, ensure_ascii=False))
