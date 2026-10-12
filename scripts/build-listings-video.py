"""Compose captioned frames from .local/frames and encode demo-video/unity-listings-provider-studio.mp4."""
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FRAMES = ROOT / '.local' / 'frames'
OUT = ROOT / 'demo-video' / 'unity-listings-provider-studio.mp4'
W, H, PANEL = 1600, 1000, 560
SECONDS = 6
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'

STEPS = [
    ('01-portal.jpeg', 'Unity Cloud portal', 'Sam Rivera (Orbit Interactive) opens Integrations > Snowflake. New to Snowflake? The portal links to a free trial.'),
    ('02-signup.jpeg', 'Create a Snowflake trial', 'The trial form on signup.snowflake.com. Shown for illustration only: the form is not submitted. After sign-up, the account is activated from the email link.'),
    ('03-account.jpeg', 'Enter the account identifier', 'Back in the portal, Sam pastes the ORG.ACCOUNT identifier: SFSENORTHAMERICA.CONSUMER_TESTING. No password or credentials are ever asked.'),
    ('04-review.jpeg', 'Review the delivery', 'Two separate private listings: the Unity Analytics Native App, and a dataset filtered to the unity_demo_orbit identity only.'),
    ('05-created.jpeg', 'Listings created', 'The portal creates both listings in the provider account, targeting the consumer account. They can be published automatically as part of the same flow.'),
    ('06-studio.jpeg', 'Provider Studio', 'Both listings appear in Provider Studio > Listings, targeting the MASTER TEST consumer account and ready to be published automatically.'),
    ('07-data.jpeg', 'Dataset listing details', 'Specified consumer, free access, description, data dictionary of the filtered view, Standard legal terms, attributes, resharing off, secure share delivery.'),
    ('08-data-more.jpeg', 'Business needs and Quick Start', 'Business needs and ready-to-run Quick Start queries against the shared, Unity-scoped view.'),
    ('09-app.jpeg', 'Native App listing details', 'Product UNITY_ANALYTICS_PACKAGE, same target account, description, business needs, Standard terms, Native App delivery.'),
    ('10-app-more.jpeg', 'App Quick Start examples', 'Quick Start queries for the installed app. Publishing stays a manual step in Provider Studio.'),
]


def wrap(draw, text, font, width):
    lines, line = [], ''
    for word in text.split():
        candidate = f'{line} {word}'.strip()
        if draw.textlength(candidate, font=font) <= width:
            line = candidate
        else:
            lines.append(line)
            line = word
    return lines + [line]


def compose(index, name, title, caption):
    canvas = Image.new('RGB', (W, H), '#0f1115')
    shot = Image.open(FRAMES / name).convert('RGB')
    area_w, area_h = W - PANEL - 60, H - 60
    shot.thumbnail((area_w, area_h), Image.LANCZOS)
    canvas.paste(shot, (30 + (area_w - shot.width) // 2, 30 + (area_h - shot.height) // 2))
    draw = ImageDraw.Draw(canvas)
    x = W - PANEL + 20
    draw.text((x, 90), f'STEP {index} OF {len(STEPS)}', font=ImageFont.truetype(BOLD, 20), fill='#5b8def')
    y = 130
    for line in wrap(draw, title, ImageFont.truetype(BOLD, 40), PANEL - 70):
        draw.text((x, y), line, font=ImageFont.truetype(BOLD, 40), fill='white')
        y += 52
    y += 20
    body = ImageFont.truetype(FONT, 26)
    for line in wrap(draw, caption, body, PANEL - 70):
        draw.text((x, y), line, font=body, fill='#c9ced6')
        y += 38
    draw.text((x, H - 70), 'Unity-inspired demo · Snowflake private listings', font=ImageFont.truetype(FONT, 18), fill='#6b7280')
    return canvas


def main():
    work = Path(tempfile.mkdtemp())
    try:
        for i, step in enumerate(STEPS, 1):
            compose(i, *step).save(work / f'{i:02d}.png')
        concat = work / 'list.txt'
        entries = [f"file '{work / f'{i:02d}.png'}'\nduration {SECONDS}" for i in range(1, len(STEPS) + 1)]
        concat.write_text('\n'.join(entries) + f"\nfile '{work / f'{len(STEPS):02d}.png'}'\n")
        OUT.parent.mkdir(exist_ok=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(concat),
                        '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-movflags', '+faststart', str(OUT)], check=True)
    finally:
        shutil.rmtree(work)
    print(OUT)


if __name__ == '__main__':
    main()
