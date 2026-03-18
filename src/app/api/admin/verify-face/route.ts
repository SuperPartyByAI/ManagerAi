import { NextResponse } from "next/server";

/**
 * POST /api/admin/verify-face
 * 
 * Receives two base64 images (ID card + selfie) and uses Gemini Flash Vision
 * to verify:
 * 1. Is the ID card a real physical document? (not a photo of a screen)
 * 2. Is the selfie a live person? (not a photo of a photo)
 * 3. Are both images showing the SAME person?
 * 
 * Returns: { verified: boolean, score: number, reason: string, details: {...} }
 */
export async function POST(req: Request) {
    try {
        const { idCardBase64, selfieBase64 } = await req.json();

        if (!idCardBase64 || !selfieBase64) {
            return NextResponse.json(
                { error: "idCardBase64 and selfieBase64 required" },
                { status: 400 }
            );
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: "GEMINI_API_KEY not configured" },
                { status: 500 }
            );
        }

        // Use Gemini Flash with vision capabilities
        const model = "gemini-2.0-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const prompt = `You are an expert identity verification system. Analyze these two images carefully.

IMAGE 1: Should be a Romanian national ID card (Carte de Identitate / Buletin).
IMAGE 2: Should be a live selfie of a person.

Perform these THREE checks and be STRICT:

CHECK 1 - DOCUMENT AUTHENTICITY:
- Is Image 1 a real physical ID card being photographed?
- Does it look like a genuine Romanian ID card (CI/BI)?
- Is it a photo OF AN ID CARD, not a photo of a screen showing an ID card?
- Can you see the physical card edges, texture, or depth?
- Score 0-100 (100 = definitely real physical card)

CHECK 2 - SELFIE LIVENESS:
- Is Image 2 a live selfie taken by a real camera?
- Does it look like a real person in front of a camera?
- Is it NOT a photo of a photo, screen, or printout?
- Check for natural lighting, depth, background consistency
- Score 0-100 (100 = definitely live selfie)

CHECK 3 - IDENTITY MATCH (MOST IMPORTANT):
- Compare the person in the ID card photo with the selfie
- Do the facial features match? (eyes, nose, mouth shape, face shape, etc.)
- Consider that ID photos may be older, different lighting, different angle
- Are they the SAME PERSON? Be very strict here.
- Score 0-100 (100 = definitely same person)

Respond ONLY with valid JSON, no markdown:
{
  "document_score": <number 0-100>,
  "document_reason": "<brief explanation>",
  "liveness_score": <number 0-100>,  
  "liveness_reason": "<brief explanation>",
  "identity_score": <number 0-100>,
  "identity_reason": "<brief explanation>",
  "same_person": <true/false>,
  "overall_verdict": "<PASS or FAIL>",
  "overall_reason": "<brief summary in Romanian>"
}`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            { text: prompt },
                            {
                                inline_data: {
                                    mime_type: "image/jpeg",
                                    data: idCardBase64.replace(/^data:image\/[a-z]+;base64,/, ""),
                                },
                            },
                            {
                                inline_data: {
                                    mime_type: "image/jpeg",
                                    data: selfieBase64.replace(/^data:image\/[a-z]+;base64,/, ""),
                                },
                            },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 1024,
                },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[VERIFY-FACE] Gemini error:", errorText);
            return NextResponse.json(
                { error: `Gemini API error: ${response.status}` },
                { status: 500 }
            );
        }

        const data = await response.json();
        const text =
            data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

        // Parse JSON from Gemini response
        let result;
        try {
            // Remove markdown code fences if present
            const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
            result = JSON.parse(cleaned);
        } catch {
            console.error("[VERIFY-FACE] Failed to parse Gemini response:", text);
            return NextResponse.json({
                verified: false,
                score: 0,
                reason: "Eroare la analiza AI",
                raw: text,
            });
        }

        // Calculate overall score
        const overallScore = Math.round(
            (result.document_score * 0.2 +
                result.liveness_score * 0.2 +
                result.identity_score * 0.6)
        );

        const verified =
            result.overall_verdict === "PASS" &&
            result.identity_score >= 60 &&
            result.document_score >= 40 &&
            result.liveness_score >= 40;

        console.log(
            `[VERIFY-FACE] Doc:${result.document_score} Live:${result.liveness_score} ID:${result.identity_score} → ${verified ? "PASS" : "FAIL"}`
        );

        return NextResponse.json({
            verified,
            score: overallScore / 100,
            same_person: result.same_person,
            details: result,
            reason: result.overall_reason || result.identity_reason,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[VERIFY-FACE] Error:", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
