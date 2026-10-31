import torch, torch.nn as nn
from modelo import TrazasNet
n = TrazasNet(pre=False); n.sal = nn.Conv2d(16, 5, 1); n.load_state_dict(torch.load('zona.pt')); n.eval()
class S(nn.Module):
    def __init__(s, n): super().__init__(); s.n = n
    def forward(s, img): return torch.softmax(s.n(img), 1)
torch.onnx.export(S(n), torch.rand(1, 3, 256, 384), 'zona.onnx', input_names=['img'], output_names=['zonas'],
                  dynamic_axes={'img': {2: 'h', 3: 'w'}, 'zonas': {2: 'h', 3: 'w'}}, opset_version=17, dynamo=False)
print('ok')
