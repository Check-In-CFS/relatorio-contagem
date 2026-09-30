/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permite uma segunda instância (diagnóstico) sem disputar a pasta .next do dev.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    // Relatórios de contagem do Santri chegam a ~16 mil itens por mês.
    serverActions: { bodySizeLimit: '20mb' },
  },
};

export default nextConfig;
