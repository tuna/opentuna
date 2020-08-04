FROM tunathu/mirror-web:latest

# Setup dependencies
RUN apt-get install -y nginx
RUN wget https://github.com/tuna/mirror-web/archive/snapshot-20200716.tar.gz -O /snapshot.tar.gz
RUN tar xvf /snapshot.tar.gz
RUN mv mirror-web-snapshot-*/* .

# Build with our config
COPY _config.yml /data
RUN rm -rf _posts/news/*
RUN jekyll build

FROM nginx:1.18-alpine
# Setup nginx
COPY nginx.conf /etc/nginx/conf.d/opentuna.conf
RUN rm /etc/nginx/conf.d/default.conf
COPY --from=0 /data/_site /site
