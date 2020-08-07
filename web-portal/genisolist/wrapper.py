import os
from configparser import ConfigParser
import shutil

def lambda_handler(event, context):
    # only /tmp is writable, work around this limitation
    # replace root path in genisolist.ini
    file = os.path.join(os.path.dirname(__file__), 'genisolist.ini')
    ini = ConfigParser()
    ini.read(file)
    ini.set('%main%', 'root', '/mnt/data/')
    tmp = '/tmp'
    with open(os.path.join(tmp, 'genisolist.ini'), 'w') as configfile:
        ini.write(configfile)
    shutil.copyfile('genisolist.py', os.path.join(tmp, 'genisolist.py'))

    os.system('python3 {}/genisolist.py > /mnt/data/isoinfo.json'.format(tmp))
