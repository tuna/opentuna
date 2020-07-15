# content-server docker image

How to build:

```bash
$ sudo docker build -t content-server:1.18-alpine .
```

How to publish to ECR:

```bash
$ sudo docker tag content-server:1.18-alpine ${uid}.dkr.ecr.${region}.amazonaws.com/content-server:1.18-alpine
$ sudo docker push ${uid}.dkr.ecr.${region}.amazonaws.com/content-server:1.18-alpine
```
