import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import vercel from "vite-plugin-vercel";
import webSpatial from "@webspatial/vite-plugin";
import { createHtmlPlugin } from "vite-plugin-html";
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        basicSsl(),
        vercel(),
        react(),
        webSpatial(),
        createHtmlPlugin({
            inject: {
                data: {
                    XR_ENV: process.env.XR_ENV,
                },
            },
        }),
    ],
    server: {
        host: true,
    },
});
