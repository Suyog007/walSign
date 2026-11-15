/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
	test: {
		environment: 'jsdom',
		setupFiles: ['./src/test/setup.ts'],
		// Placeholder values so config/seal.config.ts can load; tests never hit the network.
		env: {
			VITE_PACKAGE_ID: '0xpackage',
			VITE_REGISTRY_OBJECT_ID: '0xregistry',
			VITE_WALRUS_AGGREGATOR_URL: 'https://aggregator.test',
			VITE_WALRUS_PUBLISHER_URL: 'https://publisher.test',
			VITE_SEAL_KEY_SERVERS: '0xks1,0xks2',
		},
	},
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

