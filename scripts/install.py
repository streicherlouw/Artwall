#!/usr/bin/env python3
"""Install optional Artwall modules. Configuration/media are never removed."""
import argparse,json,os,pathlib,pwd,shutil,subprocess,sys,time
SOURCE=pathlib.Path(__file__).resolve().parent.parent
MANIFEST=json.loads((SOURCE/'modules.json').read_text())
def run(*args,**kwargs):
    print('+',' '.join(map(str,args)),flush=True)
    return subprocess.run(list(map(str,args)),check=True,**kwargs)
def load(file,fallback):
    return json.loads(file.read_text()) if file.exists() else fallback
def save(file,value):
    file.parent.mkdir(parents=True,exist_ok=True);tmp=file.with_suffix('.tmp');tmp.write_text(json.dumps(value,indent=2)+'\n');tmp.chmod(0o600);tmp.replace(file)
def merge(defaults,current):
    if not isinstance(defaults,dict) or not isinstance(current,dict):return current
    return {k:merge(v,current[k]) if k in current else v for k,v in defaults.items()}|{k:v for k,v in current.items() if k not in defaults}
def unit(module,app,config,home,uid,user,node):
    meta=MANIFEST[module];portal=module=='portal'
    environment=f'Environment=XDG_RUNTIME_DIR=/run/user/{uid}\nEnvironment=WAYLAND_DISPLAY=wayland-0\nEnvironment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/{uid}/bus\nEnvironment=ARTWALL_CONFIG_DIR={config}\nEnvironment=PATH=/usr/local/bin:/usr/bin:/bin\n'
    extra=f'User={user}\nGroup={pwd.getpwuid(uid).pw_gid}\nEnvironment=HOME={home}\nAmbientCapabilities=CAP_NET_BIND_SERVICE\nCapabilityBoundingSet=CAP_NET_BIND_SERVICE\n' if portal else f'ExecStartPre={app}/scripts/wait-display.sh\n'
    return f'''[Unit]
Description=Artwall {meta['name']}
After=network-online.target
[Service]
Type=simple
WorkingDirectory={app}/modules/{module}
{environment}{extra}ExecStart={node} {app}/modules/{module}/{meta['entry']} {config}/{module}.json
Restart=on-failure
RestartSec=5
TimeoutStartSec=120
TimeoutStopSec=25
KillMode=control-group
[Install]
WantedBy={'multi-user.target' if portal else 'default.target'}
'''
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--modules',default='photoframe,splitflap,airplay,portal',help='comma-separated optional modules')
    parser.add_argument('--setup-display',action='store_true',help='install/configure a dedicated auto-login labwc session')
    parser.add_argument('--no-deps',action='store_true',help='skip apt/npm/UxPlay installation (advanced)')
    parser.add_argument('--dry-run',action='store_true')
    parser.add_argument('--uninstall',help='remove selected comma-separated module services; retain settings and images')
    args=parser.parse_args();selected=list(dict.fromkeys((args.uninstall or args.modules).split(',')))
    if not selected or any(x not in MANIFEST for x in selected):parser.error('Choose from '+','.join(MANIFEST))
    print(('Remove' if args.uninstall else 'Install')+': '+', '.join(selected))
    if args.dry_run:
        print('Display setup:',args.setup_display,'; preserve configuration and media.');return
    if sys.platform!='linux':parser.error('Installation requires Linux; use --dry-run on other hosts')
    if os.getuid()==0:parser.error('Run as the display user, without sudo. The installer invokes sudo only when needed.')
    home=pathlib.Path.home();uid=os.getuid();user=pwd.getpwuid(uid).pw_name
    if any(c.isspace() for c in str(home)):parser.error('Home directory must not contain whitespace')
    config=home/'.config/artwall';app=home/'.local/lib/artwall';data=home/'.local/share/artwall';units=home/'.config/systemd/user'
    registry=load(config/'registry.json',{'modules':{}})
    if args.uninstall:
        for module in selected:
            if module not in registry['modules']:continue
            name=f'artwall-{module}.service'
            run(*(['sudo','systemctl'] if module=='portal' else ['systemctl','--user']),'disable','--now',name)
            target=pathlib.Path('/etc/systemd/system')/name if module=='portal' else units/name
            if module=='portal':run('sudo','rm','-f',target)
            else:target.unlink(missing_ok=True)
            registry['modules'].pop(module,None)
        save(config/'registry.json',registry)
        if 'portal' in selected and (config/'photoframe.json').exists():
            frame=load(config/'photoframe.json',{});frame['portalPort']=None;save(config/'photoframe.json',frame)
        run('systemctl','--user','daemon-reload');run('sudo','systemctl','daemon-reload');return
    run('sudo','-v')
    if not args.no_deps:
        packages=['git','rsync','nodejs','npm','python3','dbus-user-session']
        if any(x!='portal' for x in selected):packages+=['wlr-randr','pipewire','pipewire-pulse','wireplumber']
        if 'photoframe' in selected:packages+=['chromium','python3-pil']
        if 'splitflap' in selected:packages+=['python3-pygame','fonts-dejavu-core']
        if args.setup_display:packages+=['labwc','greetd']
        run('sudo','apt-get','update');run('sudo','env','DEBIAN_FRONTEND=noninteractive','apt-get','install','-y',*sorted(set(packages)))
        if 'airplay' in selected:
            ux=shutil.which('uxplay');version=subprocess.run([ux,'-v'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True).stdout if ux else ''
            if '1.73.7' not in version:run('bash',SOURCE/'scripts/install-uxplay.sh')
    node=shutil.which('node')
    if not node:raise RuntimeError('Node.js is required')
    major=int(subprocess.check_output([node,'-p','process.versions.node.split(".")[0]'],text=True))
    if major<20:raise RuntimeError('Node.js 20 or later is required')
    # Back up settings and service definitions before an update.
    if config.exists():shutil.copytree(config,data/'backups'/time.strftime('%Y%m%d-%H%M%S')/'config',dirs_exist_ok=True)
    for module in selected:
        if module in registry['modules']:
            run(*(['sudo','systemctl'] if module=='portal' else ['systemctl','--user']),'stop',f'artwall-{module}.service')
    app.mkdir(parents=True,exist_ok=True);run('rsync','-a','--exclude=.git','--exclude=node_modules','--exclude=__pycache__',str(SOURCE)+'/',str(app)+'/')
    if 'splitflap' in selected and not args.no_deps:run('npm','ci','--omit=dev','--ignore-scripts',cwd=app/'modules/splitflap')
    units.mkdir(parents=True,exist_ok=True);config.mkdir(parents=True,exist_ok=True);config.chmod(0o700)
    for module in selected:
        meta=MANIFEST[module];defaults=load(app/'modules'/module/meta['config'],{})
        runtime=f'/run/user/{uid}'
        if module=='photoframe':
            defaults.update(contentRoot=str(data/'photos'),runtimeDirectory=runtime,chromiumPath=shutil.which('chromium') or '/usr/bin/chromium')
            (data/'photos').mkdir(parents=True,exist_ok=True)
            if not (data/'photos/playlist.json').exists():save(data/'photos/playlist.json',[])
        if module=='splitflap':
            defaults['airplayStatusFile']=runtime+'/airplay-receiver-status.json';defaults.pop('audioSink',None)
        if module=='airplay':
            defaults.update(receiverName='Artwall',xdgRuntimeDir=runtime,dbusSessionBusAddress=f'unix:path={runtime}/bus',externalStatusFile=runtime+'/airplay-receiver-status.json',uxplayPath=shutil.which('uxplay') or '/usr/local/bin/uxplay')
        actual=merge(defaults,load(config/f'{module}.json',{}));save(config/f'{module}.json',actual)
        port=actual['web']['port'] if module in ['airplay','splitflap'] else actual['port']
        registry['modules'][module]={**meta,'port':port}
        text=unit(module,app,config,home,uid,user,node)
        if module=='portal':
            temp=config/'portal.service';temp.write_text(text);run('sudo','install','-m','644',temp,'/etc/systemd/system/artwall-portal.service');temp.unlink()
        else:(units/f'artwall-{module}.service').write_text(text)
    save(config/'registry.json',registry)
    if 'photoframe' in registry['modules']:
        frame=load(config/'photoframe.json',{});frame['portalPort']=registry['modules'].get('portal',{}).get('port');save(config/'photoframe.json',frame)
    bindir=home/'.local/bin';bindir.mkdir(parents=True,exist_ok=True);link=bindir/'artwall'
    if link.is_symlink():link.unlink()
    if not link.exists():link.symlink_to(app/'bin/artwall')
    run('sudo','loginctl','enable-linger',user)
    if args.setup_display:
        run('bash',app/'scripts/setup-display.sh')
    run('systemctl','--user','daemon-reload');run('sudo','systemctl','daemon-reload')
    for module in selected:
        run(*(['sudo','systemctl'] if module=='portal' else ['systemctl','--user']),'enable','--now',f'artwall-{module}.service')
    print('Installed. Local CLI:',link)
    print('Configuration:',config,'; media:',data/'photos')
if __name__=='__main__':main()
