import base64

with open('nvidia_test_output.png', 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()

html = '<html><body><img style="width:100%" src="data:image/png;base64,' + b64 + '"></body></html>'
with open('nvidia_preview.html', 'w') as h:
    h.write(html)

print('Written nvidia_preview.html')