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
                name: 'apache',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/apache/'
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
                name: 'centos-stream',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/centos-stream/'
            },
            {
                name: 'centos-vault',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/centos-vault/'
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
                name: 'linuxmint',
                interval: 1440,
                provider: 'two-stage-rsync',
                stage1_profile: 'debian',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/linuxmint/',
                rsync_options: ['"--delete-excluded"']
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
                name: 'raspbian',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/raspbian/'
            },
            {
                name: 'raspberrypi',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/raspberrypi/'
            },
            {
                name: 'rubygems',
                interval: 60,
                provider: 'command',
                upstream: 'https://mirrors.tuna.tsinghua.edu.cn/rubygems/',
                command: '$TUNASCRIPT_PATH/rubygems-s3.sh',
                docker_image: 'tunathu/rubygems-mirror-s3:release-v1.4.5',
                docker_volumes: ['"/tunasync-scripts/rubygems-s3.sh:/tunasync-scripts/rubygems-s3.sh:ro"'],
                envs: [
                    'S3_BUCKET = "++TUNA_REPO_BUCKET++"',
                ],
            },
            {
                name: 'ubuntu',
                interval: 720,
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
            {
                name: 'bioconductor',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/bioconductor/'
            },
            {
                name: 'CPAN',
                interval: 720,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/CPAN/'
            },
            {
                name: 'CRAN',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/CRAN/'
            },
            {
                name: 'CTAN',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/CTAN/'
            },
            {
                name: 'ceph',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/ceph/'
            },
            {
                name: 'chef',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/chef/'
            },
            {
                name: 'clickhouse',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/clickhouse/'
            },
            {
                name: 'clojars',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/clojars/'
            },
            {
                name: 'dart-pub',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/dart-pub/'
            },
            {
                name: 'elasticstack',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/elasticstack/'
            },
            {
                name: 'erlang-solutions',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/erlang-solutions/'
            },
            {
                name: 'flutter',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/flutter/'
            },
            {
                name: 'hackage',
                interval: 120,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/hackage/'
            },
            {
                name: 'influxdata',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/influxdata/'
            },
            {
                name: 'julia',
                interval: 60,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/julia/'
            },
            {
                name: 'julia-releases',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/julia-releases/'
            },
            {
                name: 'libreoffice',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/libreoffice/'
            },
            {
                name: 'openresty',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/openresty/'
            },
            {
                name: 'rustup',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/rustup/'
            },
            {
                name: 'sagemath',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/sagemath/'
            },
            {
                name: 'saltstack',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/saltstack/'
            },
            {
                name: 'zabbix',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/zabbix/'
            },
        ];
    } else {
        return [
            {
                name: 'elrepo',
                interval: 720,
                provider: 'rsync',
                retry: 10,
                upstream: 'rsync://ftp.yz.yamagata-u.ac.jp/pub/linux/RPMS/elrepo/'
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
            }];
    }
}

export function getMirrorTestingConfig(stage: string, domainName: string) {
    if (stage === 'prod') {
        return [{
            name: 'Ubuntu',
            repo: 'ubuntu',
            images: ['ubuntu:18.04', 'ubuntu:20.04'],
            commands: [
                `sed -E -i "s/(archive.ubuntu.com|security.ubuntu.com)/${domainName}/" /etc/apt/sources.list`,
                'apt update',
            ]
        }, {
            name: 'Debian',
            repo: 'debian',
            images: ['debian:stable', 'debian:testing'],
            commands: [
                `sed -E -i "s/(deb.debian.org|security.debian.org)/${domainName}/" /etc/apt/sources.list`,
                'apt update',
            ]
        }, {
            name: 'CentOS',
            repo: 'centos',
            images: ['centos:7'],
            commands: [
                `sed -i 's/mirrorlist/#mirrorlist/;s/#baseurl=http:\\/\\/mirror.centos.org/baseurl=https:\\/\\/${domainName}/' /etc/yum.repos.d/CentOS-*.repo`,
                'yum makecache',
            ]
        }, {
            name: 'Fedora',
            repo: 'fedora',
            images: ['fedora:32', 'fedora:33'],
            commands: [
                `sed -i 's/metalink/#metalink/;s/#baseurl=http:\\/\\/download.example\\/pub\\/fedora\\/linux/baseurl=https:\\/\\/${domainName}\\/fedora/' /etc/yum.repos.d/fedora{,-updates,-modular,-updates-modular}.repo`,
                'yum makecache',
            ]
        }, {
            name: 'Alpine',
            repo: 'alpine',
            images: ['alpine:3.9', 'alpine:3.11', 'alpine:3.12'],
            commands: [
                `sed -i 's/dl-cdn.alpinelinux.org/${domainName}/g' /etc/apk/repositories`,
                'apk update',
            ]
        }, {
            name: 'ELRepo',
            repo: 'elrepo',
            images: ['centos:7'],
            commands: [
                `sed -i 's/mirrorlist/#mirrorlist/;s/#baseurl=http:\\/\\/mirror.centos.org/baseurl=https:\\/\\/${domainName}/' /etc/yum.repos.d/CentOS-*.repo`,
                'rpm --import https://www.elrepo.org/RPM-GPG-KEY-elrepo.org',
                'yum install -y https://www.elrepo.org/elrepo-release-7.el7.elrepo.noarch.rpm',
                `sed -i 's/mirrorlist/#mirrorlist/;s/elrepo.org\\/linux/${domainName}\\/elrepo/' /etc/yum.repos.d/elrepo.repo`,
                "yum makecache",
            ]
        }];
    } else {
        return [{
            name: 'ELRepo',
            repo: 'elrepo',
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
