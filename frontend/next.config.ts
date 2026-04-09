import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Performance optimizations
    reactStrictMode: false,

    // Hide Next.js dev indicator (the "N" icon)
    devIndicators: false,

    // Reduce bundle size
    compiler: {
        removeConsole: process.env.NODE_ENV === 'production',
    },

    experimental: {
        optimizePackageImports: ['lucide-react'],
        proxyTimeout: 600000, // 10 min — LLM batch processing needs time
    },

    // @ts-ignore - explicitly requested by Next.js error message but not in types
    allowedDevOrigins: ['misdictated-claudine-nontangentially.ngrok-free.dev', '*.ngrok-free.dev'],

    // Keep proxy connections alive for long-running requests
    httpAgentOptions: {
        keepAlive: true,
    },

    webpack: (config) => {
        config.infrastructureLogging = {
            level: 'error',
        };

        return config;
    },

    async headers() {
        return [
            {
                // Apply to all routes
                source: '/:path*',
                headers: [
                    {
                        key: 'ngrok-skip-browser-warning',
                        value: 'true',
                    },
                    {
                        key: 'X-DNS-Prefetch-Control',
                        value: 'on',
                    },
                ],
            },
        ]
    },

    async rewrites() {
        return [
            {
                source: '/api/v1/:path*',
                destination: 'http://127.0.0.1:8000/api/v1/:path*',
            },
        ]
    },
};

export default nextConfig;
