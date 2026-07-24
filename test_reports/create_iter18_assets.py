from pathlib import Path
import base64

out = Path('/app/test_reports/assets_iter18')
out.mkdir(parents=True, exist_ok=True)

# 1x1 transparent PNG
png_b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
(out / 'avatar.png').write_bytes(base64.b64decode(png_b64))

pdf = b'%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'
(out / 'contract.pdf').write_bytes(pdf)

print(str(out / 'avatar.png'))
print(str(out / 'contract.pdf'))