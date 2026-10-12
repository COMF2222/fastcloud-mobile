"""Verify a signed APK and prepare the exact public updater contract."""
import argparse,hashlib,json,os,re,shutil,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def stage(apk,output):
    package=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))
    version=package['version']
    if not re.fullmatch(r'(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})',version):raise ValueError('Invalid mobile release version')
    major,minor,patch=map(int,version.split('.'));build=major*1000000+minor*1000+patch
    tag=os.environ.get('GITHUB_REF_NAME','v'+version)
    if tag!='v'+version:raise ValueError('Tag and application version do not agree')
    env=dict(os.environ);sdk=env.get('ANDROID_HOME') or env.get('ANDROID_SDK_ROOT')
    if os.name=='nt':
        runtime=Path(env['LOCALAPPDATA'])/'Fastcloud/android-toolchain/environment.json'
        if runtime.exists():
            configured=json.loads(runtime.read_text());sdk=configured['sdk'];env['JAVA_HOME']=configured['java'];env['PATH']=str(Path(configured['java'])/'bin')+os.pathsep+env['PATH']
    if not sdk:raise ValueError('Android SDK is not configured')
    tools=sorted((Path(sdk)/'build-tools').iterdir(),key=lambda path:tuple(int(v) for v in path.name.split('.') if v.isdigit()))[-1]
    signer=tools/('apksigner.bat' if os.name=='nt' else 'apksigner')
    result=subprocess.run([str(signer),'verify','--verbose','--print-certs',str(apk)],capture_output=True,text=True,env=env,check=True)
    certificate=re.search(r'Signer #1 certificate SHA-256 digest: ([a-f0-9]{64})',result.stdout)
    if not certificate or 'Android Debug' in result.stdout:raise ValueError('Public release requires the persistent private signing key')
    aapt=tools/('aapt2.exe' if os.name=='nt' else 'aapt2')
    details=subprocess.run([str(aapt),'dump','badging',str(apk)],capture_output=True,text=True,env=env,check=True).stdout
    identity=re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'",details)
    if not identity or identity.groups()!=('work.comf.fastcloud.mobile',str(build),version):raise ValueError('APK identity does not match its manifest')
    if "application-label:'Veirune'" not in details:raise ValueError('APK display name is not Veirune')
    notes=json.loads((ROOT/'docs/release-notes.json').read_text(encoding='utf-8'))
    note=next((value for value in notes['releases'] if value['version']==version),None)
    if not note:raise ValueError('Bilingual mobile release notes are missing')
    if not 1<=apk.stat().st_size<=128*1024*1024:raise ValueError('APK size is outside the supported range')
    output.mkdir(parents=True,exist_ok=True)
    name=f'Veirune-Mobile-{version}.apk';shutil.copy2(apk,output/name)
    with apk.open('rb') as stream: digest=hashlib.file_digest(stream,'sha256').hexdigest()
    info={'version':version,'build':build,'packageId':identity[1],'bytes':apk.stat().st_size,'sha256':digest,'signatureSha256':certificate[1],'url':f'https://github.com/COMF2222/fastcloud-mobile/releases/download/{tag}/{name}','notes':{language:note[language]['changes'] for language in ('ru','en')}}
    (output/'latest-android.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (output/'notes.md').write_text('# '+note['ru']['title']+'\n\n'+'\n'.join('- '+value for value in note['ru']['changes'])+'\n\n# '+note['en']['title']+'\n\n'+'\n'.join('- '+value for value in note['en']['changes'])+'\n',encoding='utf-8')
    print(f'Verified mobile {version}, build {build}, {apk.stat().st_size} bytes; signed release ready')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--apk',type=Path,default=ROOT/'android/app/build/outputs/apk/release/app-release.apk');parser.add_argument('--out',type=Path,default=ROOT/'release');args=parser.parse_args();stage(args.apk,args.out)
