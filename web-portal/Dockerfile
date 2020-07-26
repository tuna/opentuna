FROM tunathu/mirror-web:latest

# Setup dependencies
RUN apt-get install -y nginx
RUN wget https://github.com/tuna/mirror-web/archive/snapshot-20200716.tar.gz -O /snapshot.tar.gz
RUN tar xvf /snapshot.tar.gz
RUN mv mirror-web-snapshot-*/* .

# Build with our config
COPY _config.yml /data
RUN jekyll build

# Setup isoinfo
RUN mkdir -p static/status
RUN wget https://mirrors.tuna.tsinghua.edu.cn/static/status/isoinfo.json -O static/status/isoinfo.json

# Setup nginx
COPY nginx.conf /etc/nginx/sites-enabled/opentuna.conf
RUN rm /etc/nginx/sites-enabled/default
CMD ["nginx", "-g", "daemon off;"]
