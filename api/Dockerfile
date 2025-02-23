FROM oven/bun:1.2.3-alpine as build
WORKDIR /src
COPY ./src/package.json ./src/bun.lock ./
RUN bun install

FROM oven/bun
WORKDIR /src
EXPOSE 80
COPY --from=build /src/node_modules /src/node_modules
ADD ./src .
CMD ["bun", "--watch", "--smol",  "./app.js"]