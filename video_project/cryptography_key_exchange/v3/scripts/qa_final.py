"""V3 final-delivery QA entry point; reads dynamic actual narration duration."""
from pathlib import Path
import argparse,subprocess,sys

ROOT=Path(__file__).resolve().parents[1]
DEFAULT_VIDEO=ROOT/'delivery/密码学_没约过密码消息怎么保密_V3_1080p.mp4'

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--video',type=Path,default=DEFAULT_VIDEO)
    args=p.parse_args()
    video=args.video.resolve()
    if not video.is_relative_to(ROOT.resolve()):raise SystemExit('Only V3 project video is allowed.')
    if not video.is_file():raise SystemExit('Final V3 MP4 does not exist; no acceptance report written.')
    # This is the existing user audio environment; no package installs or global changes.
    audio_python=Path('D:/python_project/tts/.venv/Scripts/python.exe')
    executable=str(audio_python) if audio_python.exists() else sys.executable
    subprocess.run([executable,str(ROOT/'scripts/qa_audio_final.py'),'--video',str(video)],check=True,cwd=ROOT)
    subprocess.run([executable,str(ROOT/'scripts/qa_av_sync.py'),'--video',str(video)],check=True,cwd=ROOT)

if __name__=='__main__':main()
