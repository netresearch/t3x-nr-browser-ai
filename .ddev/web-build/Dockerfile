ARG BASE_IMAGE
FROM $BASE_IMAGE

RUN rm -f /var/www/html/index.html /var/www/html/index.php
COPY index.html /var/www/html/index.html

ARG uid
ARG gid
RUN chown "$uid:$gid" /var/www/html/index.html
