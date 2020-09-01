export function getMirrorConfig(stage: string) {
    if (stage === 'prod') {
        return [
            {
                name: 'alpine',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.bfsu.edu.cn/alpine/'
            },
            {
                name: 'archlinux',
                interval: 720,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/archlinux/'
            },
            {
                name: 'archlinuxcn',
                interval: 720,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/archlinuxcn/'
            },
            {
                name: 'archlinuxarm',
                interval: 720,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/archlinuxarm/'
            },
            {
                name: 'elrepo',
                interval: 720,
                provider: 'rsync',
                upstream: 'rsync://ftp.yz.yamagata-u.ac.jp/pub/linux/RPMS/elrepo/'
            },
            {
                name: 'epel',
                interval: 720,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/epel/'
            },
            {
                name: 'centos',
                interval: 720,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/centos/'
            },
            {
                name: 'centos-altarch',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/centos-altarch/'
            },
            {
                name: 'debian',
                interval: 720,
                retry: 100,
                provider: 'rsync',
                upstream: 'rsync://mirrors.bfsu.edu.cn/debian/',
                rsync_options: ['"--no-H"']
            },
            {
                name: 'debian-security',
                interval: 720,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/debian-security/'
            },
            {
                name: 'docker-ce',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/docker-ce/'
            },
            {
                name: 'fedora',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/fedora/'
            },
            {
                name: 'gitlab-ce',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/gitlab-ce/'
            },
            {
                name: 'gitlab-runner',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/gitlab-runner/'
            },
            {
                name: 'grafana',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/grafana/'
            },
            {
                name: 'jenkins',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/jenkins/'
            },
            {
                name: 'kubernetes',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/kubernetes/'
            },
            {
                name: 'mariadb',
                interval: 720,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/mariadb/'
            },
            {
                name: 'mongodb',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/mongodb/'
            },
            {
                name: 'mysql',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/mysql/'
            },
            {
                name: 'nodejs-release',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/nodejs-release/'
            },
            {
                name: 'nodesource',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/nodesource/'
            },
            {
                name: 'opensuse',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.bfsu.edu.cn/opensuse/'
            },
            {
                name: 'pypi',
                /**
                 * For unified cloudwatch agent to ingest multiple line logs,
                 * https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html#CloudWatch-Agent-Configuration-File-Logssection
                 */
                logStartPattern: '^\\\\\\\\d{4}-\\\\\\\\d{2}-\\\\\\\\d{2}\\\\\\\\s\\\\\\\\d{2}:\\\\\\\\d{2}:\\\\\\\\d{2},\\\\\\\\d{3}',
                timeFormat: '%Y-%m-%d %H:%M:%S',
                provider: 'command',
                upstream: 'https://pypi.python.org/',
                command: '$TUNASCRIPT_PATH/pypi.sh',
                interval: 5,
                envs: [
                    'INIT = "0"',
                ]
            },
            {
                name: 'ubuntu',
                provider: 'two-stage-rsync',
                stage1_profile: 'debian',
                upstream: 'rsync://archive.ubuntu.com/ubuntu/',
                rsync_options: ['"--delete-excluded"',]
            },
            {
                name: 'ubuntu-cdimage',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.bfsu.edu.cn/ubuntu-cdimage/'
            },
            {
                name: 'ubuntu-releases',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.bfsu.edu.cn/ubuntu-releases/'
            },
        ];
    } else {
        return [
            {
                name: 'rubygems',
                interval: 60,
                provider: 'command',
                upstream: 'https://rubygems.org/',
                command: '$TUNASCRIPT_PATH/rubygems-s3.sh',
                docker_image: 'tunathu/rubygems-mirror-s3',
                docker_volumes: ['"/tunasync-scripts/rubygems-s3.sh:/tunasync-scripts/rubygems-s3.sh:ro"'],
                envs: [
                    'S3_BUCKET = "++RUBYGEMS_BUCKET++"',
                ],
            },
            {
                name: 'elrepo',
                interval: 720,
                provider: 'rsync',
                retry: 10,
                upstream: 'rsync://ftp.yz.yamagata-u.ac.jp/pub/linux/RPMS/elrepo/'
            }];
    }
}

export function getMirrorTestingConfig(stage: string, domainName: string) {
    if (stage === 'prod') {
        return [{
            name: 'UbuntuDebian',
            images: ['ubuntu:18.04', 'ubuntu:20.04', 'debian:stable', 'debian:testing'],
            commands: [
                'apt update',
                'apt install -y apt-transport-https ca-certificates',
                `sed -E -i "s/(deb.debian.org|security.debian.org|archive.ubuntu.com|security.ubuntu.com)/${domainName}/" /etc/apt/sources.list`,
                'apt update',
            ]
        }, {
            name: 'CentOS',
            images: ['centos:8', 'centos:7', 'centos:6'],
            commands: [
                `sed -i 's/mirrorlist/#mirrorlist/;s/#baseurl=http:\\/\\/mirror.centos.org/baseurl=https:\\/\\/${domainName}/' /etc/yum.repos.d/CentOS-*.repo`,
                'yum makecache',
            ]
        }, {
            name: 'Fedora',
            images: ['fedora:31', 'fedora:32'],
            commands: [
                `sed -i 's/metalink/#metalink/;s/#baseurl=http:\\/\\/download.example\\/pub\\/fedora\\/linux/baseurl=https:\\/\\/${domainName}\\/fedora/' /etc/yum.repos.d/fedora{,-updates,-modular,-updates-modular}.repo`,
                'yum makecache',
            ]
        }, {
            name: 'Alpine',
            images: ['alpine:3.9', 'alpine:3.11', 'alpine:3.12'],
            commands: [
                `sed -i 's/dl-cdn.alpinelinux.org/${domainName}/g' /etc/apk/repositories`,
                'apk update',
            ]
        }, {
            name: 'elrepo',
            images: ['centos:7'],
            commands: [
                'rpm --import https://www.elrepo.org/RPM-GPG-KEY-elrepo.org',
                'yum install -y https://www.elrepo.org/elrepo-release-7.el7.elrepo.noarch.rpm',
                `sed -i 's/mirrorlist/#mirrorlist/;s/elrepo.org\\/linux/${domainName}\\/elrepo/' /etc/yum.repos.d/elrepo.repo`,
                "yum makecache",
            ]
        }];
    } else {
        return [{
            name: 'elrepo',
            images: ['centos:7'],
            commands: [
                'rpm --import https://www.elrepo.org/RPM-GPG-KEY-elrepo.org',
                'yum install -y https://www.elrepo.org/elrepo-release-7.el7.elrepo.noarch.rpm',
                `sed -i 's/mirrorlist/#mirrorlist/;s/elrepo.org\\/linux/${domainName}\\/elrepo/' /etc/yum.repos.d/elrepo.repo`,
                "yum makecache",
            ]
        }];
    }
}