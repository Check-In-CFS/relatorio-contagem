/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Relatórios de contagem do Santri chegam a ~16 mil itens por mês.
    serverActions: { bodySizeLimit: '20mb' },
  },
};

export default nextConfig;
