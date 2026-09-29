# Stage 1: build the React app into static files.
FROM node:20-alpine AS build
WORKDIR /app

# Build-time secrets/config. Vite substitutes any VITE_* variable that is
# set in the environment when `npm run build` runs. Docker BuildKit forwards
# these from the host through the ARG below when they are listed in the
# compose file's build.args, so a rebuild picks up new token values.
ARG VITE_MAPBOX_TOKEN=
ARG VITE_MAPBOX_STYLE=
ARG VITE_MAPBOX_STYLE_DARK=
ARG VITE_MAPBOX_STYLE_LIGHT=
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN
ENV VITE_MAPBOX_STYLE=$VITE_MAPBOX_STYLE
ENV VITE_MAPBOX_STYLE_DARK=$VITE_MAPBOX_STYLE_DARK
ENV VITE_MAPBOX_STYLE_LIGHT=$VITE_MAPBOX_STYLE_LIGHT

COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# Stage 2: serve the static build with Nginx (small image, no Node at runtime).
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
