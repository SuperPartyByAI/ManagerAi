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

        const prompt = `You are an EXTREMELY STRICT identity verification security system. You must protect against fraud. Analyze these two images with maximum suspicion.

IMAGE 1: Should be a Romanian national ID card (Carte de Identitate / Buletin).
IMAGE 2: Should be a LIVE selfie taken directly by the phone's front camera.

⚠️ CRITICAL ANTI-FRAUD RULES — READ VERY CAREFULLY:

CHECK 1 - DOCUMENT AUTHENTICITY & SECURITY ELEMENTS (Score 0-100):
Verify Image 1 is a REAL, ORIGINAL Romanian Carte de Identitate (CI):

🔍 PHYSICAL DOCUMENT CHECKS:
- Is it a physical card photographed directly? (not a screen, not a printout)
- Card must have proper dimensions/proportions of a Romanian CI
- Look for real card edges, card thickness visible from angle
- FAIL if: screen pixels, Moiré patterns, LCD glow, phone bezels visible

🇷🇴 ROMANIAN CI SECURITY ELEMENTS (check ALL):
- "ROUMANIE / ROMANIA" header text at the top
- Romanian coat of arms (eagle with cross) visible
- "CARTE DE IDENTITATE" text present
- Photo area with proper placement and frame
- Text fields: CNP, Nume/Nom, Prenume/Prénom, Cetățenie, Loc naștere, Domiciliu
- Valid CNP format (13 digits starting with 1,2,5,6)
- Validity dates (Emisă de / Valabilitate) in proper format
- Issuing authority "S.P.C.E.P." or similar
- MRZ zone at bottom (machine-readable zone with <<< characters)
- MRZ must start with "IDROU" for Romanian ID

🛡️ ANTI-COUNTERFEIT CHECKS:
- FAIL if: text appears obviously photoshopped or digitally edited
- FAIL if: font style is inconsistent or non-standard
- FAIL if: image appears to be a photocopy (flat lighting, no card depth, grainy)
- FAIL if: image appears to be a PHOTO OF ANOTHER PHOTO (photo within photo)
- FAIL if: holographic/security overlay patterns are completely absent or look printed
- FAIL if: card background patterns/guilloché designs are blurry or missing
- FAIL if: the card appears hand-drawn, printed on paper, or obviously fake
- Score 90+ ONLY if all security elements are clearly visible and authentic-looking

CHECK 2 - SELFIE LIVENESS (MOST CRITICAL CHECK - Score 0-100):
THIS IS THE MOST IMPORTANT CHECK. You MUST detect if the selfie is fake.

🚨 AUTOMATIC SCORE 0 (FAIL) if ANY of these are detected:
- A phone, tablet, or any electronic screen is visible in Image 2
- You can see phone bezels, screen edges, or device outlines
- The "face" appears to be DISPLAYED ON A SCREEN (photo of a phone showing a face)
- You see Moiré patterns, pixel grid, screen glare, or LCD artifacts
- The image shows someone HOLDING A PHONE that displays a face or photo
- The background contains a phone/tablet frame around the face
- Screen brightness inconsistency (face lit differently than surroundings because it's a screen)
- Status bar, notification bar, or app UI elements visible
- The image looks like a photo taken OF ANOTHER PHONE'S SCREEN

✅ SCORE 80+ ONLY if:
- Direct camera capture of a real human face
- Natural skin texture visible (pores, fine lines)  
- Natural depth of field (background slightly blurred)
- Consistent natural lighting across the entire image
- NO electronic device frames or screens visible AT ALL
- The person appears to be physically present in front of the camera

CHECK 3 - IDENTITY MATCH (Score 0-100):
- Compare the face in the ID card with the face in the selfie
- ONLY compare if BOTH Check 1 and Check 2 PASS (score >= 60)
- If either check failed, set identity_score to 0 and same_person to false
- Look at: face shape, eye spacing, nose shape, mouth, jawline
- Account for aging (ID photo may be years old), facial hair changes, glasses
- Score 0-100 (100 = definitely same person)

RESPOND ONLY with valid JSON, no markdown, no extra text:
{
  "document_score": <number 0-100>,
  "document_reason": "<brief explanation including which security elements were found/missing>",
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
                    temperature: 0.05,
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
                result.liveness_score * 0.3 +
                result.identity_score * 0.5)
        );

        // STRICT verification: liveness must be >= 70, all checks must pass
        const verified =
            result.overall_verdict === "PASS" &&
            result.identity_score >= 60 &&
            result.document_score >= 50 &&
            result.liveness_score >= 70;

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
