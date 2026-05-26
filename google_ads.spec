from PyInstaller.utils.hooks import collect_all

block_cipher = None

# Recolectar todos los submodulos y datos de los SDKs pesados
datas_ga, binaries_ga, hiddenimports_ga = collect_all('google.ads.googleads')
datas_gauth, binaries_gauth, hiddenimports_gauth = collect_all('google.auth')
datas_proto, binaries_proto, hiddenimports_proto = collect_all('proto')
datas_mcp, binaries_mcp, hiddenimports_mcp = collect_all('mcp')
datas_anyio, binaries_anyio, hiddenimports_anyio = collect_all('anyio')
datas_grpc, binaries_grpc, hiddenimports_grpc = collect_all('grpc')

a = Analysis(
    ['google_ads/server.py'],
    pathex=[],
    binaries=(
        binaries_ga + binaries_gauth + binaries_proto
        + binaries_mcp + binaries_anyio + binaries_grpc
    ),
    datas=(
        datas_ga + datas_gauth + datas_proto
        + datas_mcp + datas_anyio + datas_grpc
    ),
    hiddenimports=(
        hiddenimports_ga
        + hiddenimports_gauth
        + hiddenimports_proto
        + hiddenimports_mcp
        + hiddenimports_anyio
        + hiddenimports_grpc
        + [
            'dotenv',
            'google.api_core',
            'google.api_core.gapic_v1',
            'google.protobuf',
            'google.oauth2',
            'google.oauth2.credentials',
            'google.auth.transport.requests',
            'googleapis_common_protos',
            'proto.marshal',
            'starlette',
            'uvicorn',
            'httpx',
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
    name='google_ads',
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
