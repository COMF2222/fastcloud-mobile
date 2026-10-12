"""Install a private, checksum-verified Android toolchain (Windows only)."""
import hashlib,json,os,subprocess,urllib.request,zipfile,ctypes
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT=Path(os.environ['LOCALAPPDATA'])/'Fastcloud'/'android-toolchain'
ROOT.mkdir(parents=True,exist_ok=True)
def read(url):
    return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Fastcloud-mobile-setup'}),timeout=60)
def archive(url,checksum,algorithm='sha256'):
    path=ROOT/url.rsplit('/',1)[-1]
    if not path.exists() or hashlib.new(algorithm,path.read_bytes()).hexdigest()!=checksum:
        print('Downloading',path.name,flush=True)
        with read(url) as response,path.open('wb') as out:
            while chunk:=response.read(1024*1024):out.write(chunk)
    if hashlib.new(algorithm,path.read_bytes()).hexdigest()!=checksum:raise RuntimeError('Download checksum mismatch')
    return path
def extract(path,destination):
    destination.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(path) as source:
        for entry in source.infolist():
            target=(destination/entry.filename).resolve()
            if not target.is_relative_to(destination.resolve()):raise RuntimeError('Unsafe archive path')
        source.extractall(destination)
jdks=list((ROOT/'java').glob('*/bin/java.exe')) if (ROOT/'java').exists() else []
if not jdks:
    data=json.load(read('https://api.github.com/repos/adoptium/temurin21-binaries/releases/latest'))
    asset=next(x for x in data['assets'] if 'jdk_x64_windows_hotspot' in x['name'] and x['name'].endswith('.zip'))
    checksum=read(asset['browser_download_url']+'.sha256.txt').read().decode().split()[0]
    extract(archive(asset['browser_download_url'],checksum),ROOT/'java')
    jdks=list((ROOT/'java').glob('*/bin/java.exe'))
sdk=ROOT/'sdk';manager=sdk/'cmdline-tools'/'19.0'/'bin'/'sdkmanager.bat'
if not manager.exists():
    doc=ET.fromstring(read('https://dl.google.com/android/repository/repository2-3.xml').read())
    package=next(p for p in doc if p.tag.endswith('remotePackage') and p.attrib.get('path')=='cmdline-tools;19.0')
    windows=next(a for a in package.find('archives') if a.findtext('host-os')=='windows').find('complete')
    path=archive('https://dl.google.com/android/repository/'+windows.findtext('url'),windows.findtext('checksum'),'sha1')
    extract(path,ROOT/'sdk-19-unpacked')
    (sdk/'cmdline-tools').mkdir(parents=True,exist_ok=True)
    (ROOT/'sdk-19-unpacked'/'cmdline-tools').rename(sdk/'cmdline-tools'/'19.0')
env={**os.environ,'JAVA_HOME':str(jdks[0].parent.parent),'ANDROID_HOME':str(sdk)}
env['PATH']=str(jdks[0].parent)+os.pathsep+env['PATH']
print('Installing Android API 36, build tools and platform tools',flush=True)
subprocess.run([str(manager),'--sdk_root='+str(sdk),'--licenses'],input='y\n'*30,text=True,env=env,check=True)
subprocess.run([str(manager),'--sdk_root='+str(sdk),'platforms;android-36','build-tools;36.0.0','platform-tools'],env=env,check=True)
if not (sdk/'platforms'/'android-36'/'android.jar').exists():raise RuntimeError('Android platform installation did not complete')
(ROOT/'environment.json').write_text(json.dumps({'java':env['JAVA_HOME'],'sdk':str(sdk)}))
project=Path(__file__).resolve().parents[1]
buffer=ctypes.create_unicode_buffer(32768)
ctypes.windll.kernel32.GetShortPathNameW(str(sdk),buffer,len(buffer))
sdk_property=(buffer.value or str(sdk)).replace('\\','/').replace(':','\\:')
(project/'android'/'local.properties').write_text('sdk.dir='+sdk_property+'\n')
print('Android toolchain ready',flush=True)
