import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		proxy: {
			// Proxy Walrus requests to avoid CORS issues
			'/walrus-publisher': {
				target: 'https://publisher.walrus-testnet.walrus.space',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/walrus-publisher/, ''),
				configure: (proxy, _options) => {
					proxy.on('error', (err, _req, _res) => {
						console.log('Walrus publisher proxy error', err);
					});
					proxy.on('proxyReq', (proxyReq, req, _res) => {
						console.log('Sending Request to Walrus Publisher:', req.method, req.url);
					});
					proxy.on('proxyRes', (proxyRes, req, _res) => {
						console.log('Received Response from Walrus Publisher:', proxyRes.statusCode, req.url);
					});
				},
			},
			'/walrus-aggregator': {
				target: 'https://aggregator.walrus-testnet.walrus.space',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/walrus-aggregator/, ''),
				configure: (proxy, _options) => {
					proxy.on('error', (err, _req, _res) => {
						console.log('Walrus aggregator proxy error', err);
					});
				},
			},
		},
	},
});

