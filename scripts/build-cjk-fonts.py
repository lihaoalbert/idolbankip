#!/usr/bin/env python3
"""
scripts/build-cjk-fonts.py — 生成合同 PDF 用的 Noto Sans SC TTF

为什么:
  Noto Sans SC 的 SubsetOTF 是 CID-keyed CFF (Adobe CIDFont) — pdf-lib + fontkit 重新 subset
  会触发 CFF subroutine bug,中文渲染为 tofu。TTF 用 TrueType outlines,fontkit 处理可靠。

用法:
  python3 scripts/build-cjk-fonts.py
  # 输出:
  #   apps/api/assets/fonts/NotoSansSC-Regular.gb2312.ttf  (7.3MB,覆盖 GB2312 全部 21K 字符)
  #   apps/api/assets/fonts/NotoSansSC-Bold.gb2312.ttf      (7.3MB,同上)

依赖:
  pip3 install --user fonttools brotli
"""
import os
import sys
import urllib.request
from fontTools.subset import Subsetter, Options
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO_ROOT, 'apps', 'api', 'assets', 'fonts')
VF_URL = 'https://github.com/notofonts/noto-cjk/raw/main/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf'
VF_TMP = '/tmp/NotoSansSC-VF.ttf'

# 覆盖范围:GB2312 一二级 + 通用符号 + ASCII + 全角
#   - U+4E00..U+9FBF:CJK 统一汉字基本平面 (6960 chars,覆盖 GB2312 一二级)
#   - U+3000..U+303F:CJK 符号和标点
#   - U+FF00..U+FFEF:全角 ASCII / 半角片假名
#   - 0x20..0x7E:ASCII 可打印
#   - 杂项:¥ · € ！ % ， ： ； ？
CJK_RANGE = set(range(0x4E00, 0x9FBF + 1))
CJK_SYMBOLS = set(range(0x3000, 0x303F + 1))
FULLWIDTH = set(range(0xFF00, 0xFFEF + 1))
ASCII_PRINTABLE = set(range(0x20, 0x7E + 1))
SPECIAL = {0xA5, 0xB7, 0x2022, 0x20AC, 0xFF01, 0xFF05, 0xFF0C, 0xFF1A, 0xFF1B, 0xFF1F}
UNICODES = sorted(CJK_RANGE | CJK_SYMBOLS | FULLWIDTH | ASCII_PRINTABLE | SPECIAL)


def download_vf():
    if not os.path.exists(VF_TMP):
        print(f'下载 Noto Sans SC VF TTF (17.7MB) ...')
        urllib.request.urlretrieve(VF_URL, VF_TMP)
    print(f'VF TTF: {os.path.getsize(VF_TMP):,} bytes')


def instance_and_subset():
    os.makedirs(OUT_DIR, exist_ok=True)
    for weight, label in [(400, 'Regular'), (700, 'Bold')]:
        print(f'\n=== {label} (wght={weight}) ===')
        # 1. VF → static TTF
        font = TTFont(VF_TMP)
        instantiateVariableFont(font, {'wght': weight}, inplace=True, overlap=True)
        static_ttf = os.path.join(OUT_DIR, f'.{label}.static.tmp')
        font.save(static_ttf)
        # 2. Subset 到 GB2312 范围
        font = TTFont(static_ttf)
        opts = Options()
        opts.layout_features = ['*']
        opts.name_IDs = ['*']
        opts.name_legacy = True
        opts.name_languages = ['*']
        opts.notdef_outline = True
        opts.recalc_bounds = True
        opts.recalc_timestamp = False
        opts.hinting = False
        s = Subsetter(options=opts)
        s.populate(unicodes=UNICODES)
        s.subset(font)
        out = os.path.join(OUT_DIR, f'NotoSansSC-{label}.gb2312.ttf')
        font.save(out)
        os.remove(static_ttf)
        size = os.path.getsize(out)
        print(f'  写入: {out}')
        print(f'  大小: {size:,} bytes ({size/1024:.0f} KB) — {len(UNICODES):,} codepoints')


if __name__ == '__main__':
    print('=== build-cjk-fonts.py ===')
    try:
        download_vf()
        instance_and_subset()
        print('\n✅ 字体生成完成')
    except Exception as e:
        print(f'\n❌ 失败: {e}', file=sys.stderr)
        sys.exit(1)
