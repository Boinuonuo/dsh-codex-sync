/** Fixed Windows OpenSSH reader. Configuration is data, never executable PowerShell. */
export function buildWindowsCommand(configBase64) {
  if (typeof configBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/u.test(configBase64)) throw new Error('Invalid encoded SSH configuration')
  const script = `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; & py -3 -I - '${configBase64}'; exit $LASTEXITCODE`
  return `powershell -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(script, 'utf16le').toString('base64')}`
}

// Keep ancestor directory handles open without FILE_SHARE_DELETE. Once validated,
// a directory/file cannot be swapped for a junction/reparse point while it is used.
// ReadFile uses the same opened file handle whose attributes/final path were checked.
export const WINDOWS_REMOTE_SCRIPT = String.raw`import base64, ctypes, json, ntpath, os, sys, time
from ctypes import wintypes as W
cfg = json.loads(base64.b64decode(sys.argv[1], validate=True))
started = time.monotonic()
count = total = scanned = skipped = unreadable = 0
out = sys.stdout.buffer
k = ctypes.WinDLL('kernel32', use_last_error=True)

class FILETIME(ctypes.Structure):
    _fields_ = [('low', W.DWORD), ('high', W.DWORD)]
class INFO(ctypes.Structure):
    _fields_ = [('attrs', W.DWORD), ('created', FILETIME), ('accessed', FILETIME), ('written', FILETIME), ('volume', W.DWORD), ('sizeHigh', W.DWORD), ('sizeLow', W.DWORD), ('links', W.DWORD), ('indexHigh', W.DWORD), ('indexLow', W.DWORD)]
k.CreateFileW.argtypes = [W.LPCWSTR, W.DWORD, W.DWORD, ctypes.c_void_p, W.DWORD, W.DWORD, W.HANDLE]
k.CreateFileW.restype = W.HANDLE
k.GetFileInformationByHandle.argtypes = [W.HANDLE, ctypes.POINTER(INFO)]
k.GetFileInformationByHandle.restype = W.BOOL
k.GetFinalPathNameByHandleW.argtypes = [W.HANDLE, W.LPWSTR, W.DWORD, W.DWORD]
k.GetFinalPathNameByHandleW.restype = W.DWORD
k.ReadFile.argtypes = [W.HANDLE, ctypes.c_void_p, W.DWORD, ctypes.POINTER(W.DWORD), ctypes.c_void_p]
k.ReadFile.restype = W.BOOL
k.CloseHandle.argtypes = [W.HANDLE]
k.CloseHandle.restype = W.BOOL
INVALID = ctypes.c_void_p(-1).value
REPARSE, DIRECTORY = 0x400, 0x10

class Unsafe(Exception):
    pass

def emit(record):
    write_all(json.dumps(record, separators=(',', ':')).encode('utf-8') + b'\n')
    out.flush()

def write_all(data):
    view = memoryview(data)
    while view:
        n = out.write(view)
        if not n:
            raise BrokenPipeError('short protocol write')
        view = view[n:]

def check_time():
    if (time.monotonic() - started) * 1000 > cfg['timeoutMs']:
        raise RuntimeError('SSH_TIMEOUT: remote snapshot timed out')

def canonical(path):
    if path.startswith('\\\\?\\'):
        path = path[4:]
    return ntpath.normcase(ntpath.normpath(path))

def open_checked(path, directory):
    # FILE_SHARE_READ | FILE_SHARE_WRITE, deliberately NOT FILE_SHARE_DELETE.
    h = k.CreateFileW(path, 0x80 if directory else 0x80000000, 3, None, 3, 0x02200000, None)
    if h == INVALID:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        info = INFO()
        if not k.GetFileInformationByHandle(h, ctypes.byref(info)):
            raise ctypes.WinError(ctypes.get_last_error())
        if info.attrs & REPARSE or bool(info.attrs & DIRECTORY) != directory:
            raise Unsafe('reparse point or unexpected file type')
        buffer = ctypes.create_unicode_buffer(32768)
        n = k.GetFinalPathNameByHandleW(h, buffer, len(buffer), 0)
        if not n or n >= len(buffer) or canonical(buffer.value) != canonical(path):
            raise Unsafe('opened path differs from requested path')
        return h, info
    except BaseException:
        k.CloseHandle(h)
        raise

def root_handles(path):
    if not isinstance(path, str) or '..' in path.replace('/', '\\').split('\\'):
        raise Unsafe('invalid root')
    path = ntpath.normpath(os.path.expanduser(path))
    drive, tail = ntpath.splitdrive(path)
    if len(drive) != 2 or drive[1] != ':' or not tail.startswith('\\'):
        raise Unsafe('expected drive-absolute Windows root')
    handles = []
    current = drive + '\\'
    try:
        handle, _ = open_checked(current, True)
        handles.append(handle)
        for component in tail.split('\\'):
            if not component or component == '.':
                continue
            if ':' in component:
                raise Unsafe('invalid path component')
            current = ntpath.join(current, component)
            handle, _ = open_checked(current, True)
            handles.append(handle)
        return path, handles
    except BaseException:
        for h in reversed(handles):
            k.CloseHandle(h)
        raise

def walk(path, parts, depth=0):
    global count, total, scanned, skipped, unreadable
    if depth > 64:
        raise RuntimeError('SSH_LIMIT: sessions directory nesting exceeds 64')
    with os.scandir(path) as entries:
        for entry in entries:
            check_time()
            scanned += 1
            if scanned > max(10000, min(1000000, cfg['maxFiles'] * 100)):
                raise RuntimeError('SSH_LIMIT: sessions scan entry limit exceeded')
            name = entry.name
            if name in ('.', '..') or any(c in name for c in '/\\:'):
                unreadable += 1
                continue
            try:
                attrs = entry.stat(follow_symlinks=False).st_file_attributes
            except OSError:
                unreadable += 1
                continue
            if attrs & REPARSE:
                unreadable += 1
                continue
            child = ntpath.join(path, name)
            if attrs & DIRECTORY:
                try:
                    h, _ = open_checked(child, True)
                except (OSError, Unsafe):
                    unreadable += 1
                    continue
                try:
                    walk(child, parts + [name], depth + 1)
                finally:
                    k.CloseHandle(h)
                continue
            if not (name.startswith('rollout-') and (name.endswith('.jsonl') or name.endswith('.jsonl.zst'))):
                continue
            count += 1
            if count > cfg['maxFiles']:
                raise RuntimeError('SSH_LIMIT: maxFiles exceeded')
            try:
                h, info = open_checked(child, False)
            except (OSError, Unsafe):
                unreadable += 1
                continue
            try:
                size = (info.sizeHigh << 32) | info.sizeLow
                if size > cfg['maxSessionBytes']:
                    skipped += 1
                    continue
                if total + size > cfg['maxTotalBytes']:
                    raise RuntimeError('SSH_LIMIT: maxTotalBytes exceeded')
                total += size
                emit({'type': 'file', 'path': '/'.join(parts + [name]), 'size': size})
                remaining = size
                buf = ctypes.create_string_buffer(65536)
                while remaining:
                    check_time()
                    n = W.DWORD()
                    if not k.ReadFile(h, buf, min(remaining, len(buf)), ctypes.byref(n), None):
                        raise ctypes.WinError(ctypes.get_last_error())
                    if not n.value:
                        raise RuntimeError('SSH_READ: rollout truncated during read')
                    write_all(buf.raw[:n.value])
                    remaining -= n.value
                out.flush()
            finally:
                k.CloseHandle(h)

held = []
try:
    try:
        home, held = root_handles(cfg['codexHome'])
        sessions = ntpath.join(home, 'sessions')
        h, _ = open_checked(sessions, True)
        held.append(h)
    except (OSError, Unsafe) as error:
        code = 'SSH_ROOT_MISSING' if isinstance(error, OSError) and error.winerror in (2, 3) else 'SSH_ROOT_UNSAFE'
        raise RuntimeError(code + ': codexHome/sessions is absent, unreadable or reparse-linked')
    if cfg.get('probeOnly'):
        emit({'type': 'probe', 'platform': 'windows', 'sessionRoot': True})
    else:
        walk(sessions, [])
    emit({'type': 'done', 'files': count, 'bytes': total, 'skippedBig': skipped, 'unreadable': unreadable})
except BaseException as error:
    if not isinstance(error, BrokenPipeError):
        emit({'type': 'error', 'message': str(error)[:1000]})
    sys.exit(1)
finally:
    for h in reversed(held):
        k.CloseHandle(h)
`
