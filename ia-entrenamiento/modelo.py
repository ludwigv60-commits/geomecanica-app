import torch, torch.nn as nn, torch.nn.functional as F
from torchvision.models import mobilenet_v3_large, MobileNet_V3_Large_Weights

class Bloque(nn.Module):
    def __init__(s, cin, cout):
        super().__init__()
        s.c = nn.Sequential(nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
                            nn.Conv2d(cout, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True))
    def forward(s, x): return s.c(x)

class TrazasNet(nn.Module):
    """U-Net ligera: codificador MobileNetV3-Large (ImageNet) hasta 1/16, decodificador con saltos."""
    def __init__(s, pre=True):
        super().__init__()
        f = mobilenet_v3_large(weights=MobileNet_V3_Large_Weights.IMAGENET1K_V2 if pre else None).features
        s.e1, s.e2, s.e3, s.e4 = f[:2], f[2:4], f[4:7], f[7:13]   # 16@1/2, 24@1/4, 40@1/8, 112@1/16
        s.d3 = Bloque(112 + 40, 64); s.d2 = Bloque(64 + 24, 32); s.d1 = Bloque(32 + 16, 24)
        s.d0 = Bloque(24 + 3, 16); s.sal = nn.Conv2d(16, 1, 1)
        s.register_buffer('m', torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1))
        s.register_buffer('d', torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1))
    def forward(s, x):  # x: 0..1 RGB
        z = (x - s.m) / s.d
        a = s.e1(z); b = s.e2(a); c = s.e3(b); d = s.e4(c)
        up = lambda t, r: F.interpolate(t, size=r.shape[-2:], mode='bilinear', align_corners=False)
        y = s.d3(torch.cat([up(d, c), c], 1)); y = s.d2(torch.cat([up(y, b), b], 1))
        y = s.d1(torch.cat([up(y, a), a], 1)); y = s.d0(torch.cat([up(y, x), z], 1))
        return s.sal(y)

if __name__ == '__main__':
    m = TrazasNet(); print(sum(p.numel() for p in m.parameters()) / 1e6, 'M params')
    import time; x = torch.rand(8, 3, 224, 224); t = time.time(); m(x).mean().backward(); print(time.time() - t, 's/batch8')
