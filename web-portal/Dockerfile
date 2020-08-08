FROM tunathu/mirror-web:latest

# Setup dependencies
RUN apt-get install -y nginx
COPY mirror-web ./

# Build with our config
COPY _config.yml /data
RUN wget https://github.com/tuna/opentuna-site/archive/master.tar.gz -O /site.tar.gz
RUN tar xvf /site.tar.gz -C /tmp
RUN cp /tmp/opentuna-site-*/options.yml _data/options.yml
RUN rm -rf news/_posts/*
RUN cp /tmp/opentuna-site-*/news/* news/_posts/
RUN find help/_posts -type f -regextype posix-egrep -not -regex ".*(alpine|centos|debian|docker|elrepo|epel|fedora|gitlab|grafana|jenkins|kubernetes|mariadb|mongodb|mysql|node|opensuse|pypi|ubuntu).*" -delete
RUN jekyll build

FROM nginx:1.18-alpine
# Setup nginx
COPY nginx.conf /etc/nginx/conf.d/opentuna.conf
RUN rm /etc/nginx/conf.d/default.conf
COPY --from=0 /data/_site /site
