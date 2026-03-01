import { NextResponse } from "next/server";

export async function GET() {
    try {
        // SGS - Sistema Gerenciador de Séries Temporais (Banco Central do Brasil)
        // 432: Selic meta (% a.a.)
        // 13522: IPCA - Variação acumulada nos últimos 12 meses (%)

        const urls = [
            "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json",
            "https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json"
        ];

        const [selicRes, ipcaRes] = await Promise.all(urls.map(url => fetch(url)));

        if (!selicRes.ok || !ipcaRes.ok) {
            throw new Error("Failed to fetch data from Banco Central");
        }

        const [selicData, ipcaData] = await Promise.all([selicRes.json(), ipcaRes.json()]);

        return NextResponse.json({
            selic: selicData[0]?.valor || null,
            ipca: ipcaData[0]?.valor || null,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Market API error:", error);
        return NextResponse.json({ error: "Failed to fetch market data" }, { status: 500 });
    }
}
