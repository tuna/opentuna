export function getMirrorConfig(stage: string) {
    if (stage === 'prod') {
        return [
            {
                name: 'alpine',
                interval: 1440,
                provider: 'rsync',
                upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/alpine/'
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
                upstream: 'rsync://mirrors.bfsu.edu.cn/debian/'
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