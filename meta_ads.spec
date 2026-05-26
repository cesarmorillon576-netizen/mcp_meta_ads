from PyInstaller.utils.hooks import collect_all

block_cipher = None

# Recolectar todos los submodulos y datos de los SDKs pesados
datas_fb, binaries_fb, hiddenimports_fb = collect_all('facebook_business')
datas_mcp, binaries_mcp, hiddenimports_mcp = collect_all('mcp')
datas_anyio, binaries_anyio, hiddenimports_anyio = collect_all('anyio')

a = Analysis(
    ['meta_ads/server.py'],
    pathex=[],
    binaries=binaries_fb + binaries_mcp + binaries_anyio,
    datas=datas_fb + datas_mcp + datas_anyio,
    hiddenimports=(
        hiddenimports_fb
        + hiddenimports_mcp
        + hiddenimports_anyio
        + [
            'dotenv',
            'starlette',
            'starlette.applications',
            'starlette.routing',
            'uvicorn',
            'uvicorn.logging',
            'uvicorn.loops',
            'uvicorn.loops.asyncio',
            'uvicorn.protocols',
            'uvicorn.protocols.http',
            'uvicorn.protocols.http.auto',
            'httpx',
            'httpcore',
            'sniffio',
        ]
    ),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='meta_ads',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
