import sys, torch
from modelo import TrazasNet
class ConSigmoide(torch.nn.Module):
    def __init__(s, n): super().__init__(); s.n = n
    def forward(s, img): return torch.sigmoid(s.n(img))
pt, out = sys.argv[1], sys.argv[2]
n = TrazasNet(pre=False); n.load_state_dict(torch.load(pt)); n.eval()
torch.onnx.export(ConSigmoide(n), torch.rand(1, 3, 480, 640), out, input_names=['img'], output_names=['prob'],
                  dynamic_axes={'img': {2: 'h', 3: 'w'}, 'prob': {2: 'h', 3: 'w'}}, opset_version=17, dynamo=False)
import onnx; m = onnx.load(out); onnx.checker.check_model(m); print('ok', out)
