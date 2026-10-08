FROM alpine:3.21
RUN apk add --no-cache postgresql16-client restic ca-certificates
COPY scripts/backup-postgres.sh /usr/local/bin/backup-postgres
RUN chmod 0755 /usr/local/bin/backup-postgres
USER 10001:10001
ENTRYPOINT ["/usr/local/bin/backup-postgres"]
