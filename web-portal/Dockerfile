FROM tunathu/mirror-web:latest

# Setup timezone and website
ENV TZ=Asia/Shanghai
COPY mirror-web ./

# Build with our config
COPY _config.yml /data
COPY opentuna-site/options.yml _data/options.yml
RUN rm -rf news/_posts/*
COPY opentuna-site/news/* news/_posts/
RUN find help/_posts -type f -regextype posix-egrep -not -regex ".*(archlinux|archlinuxcn|alpine|apache|centos|debian|docker|elrepo|epel|fedora|gitlab|grafana|jenkins|kubernetes|linuxmint|mariadb|mongodb|mysql|node|opensuse|pypi|rubygems|ubuntu|bioconductor|CPAN|CRAN|CTAN|ceph|chef|clickhouse|clojars|dart-pub|elasticstack|erlang-solutions|flutter|hackage|hugging-face-models|influxdata|julia|julia-releases|libreoffice|openresty|rustup|sagemath|saltstack|zabbix|raspbian|raspberrypi).*" -delete
RUN jekyll build

FROM nginx:1.18-alpine
# Setup nginx
ENV TZ=Asia/Shanghai
COPY nginx.conf /etc/nginx/conf.d/opentuna.conf
RUN rm /etc/nginx/conf.d/default.conf
COPY --from=0 /data/_site /site
