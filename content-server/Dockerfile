FROM nginx:1.18-alpine
COPY nginx.conf /etc/nginx/conf.d/opentuna.conf
RUN rm /etc/nginx/conf.d/default.conf
RUN mkdir -p /mnt/efs
