import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  // Validate file type
  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
  ];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Only PDF, DOCX, DOC, and TXT files are allowed." },
      { status: 400 }
    );
  }

  // Max 5MB
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 5MB." }, { status: 400 });
  }

  const ext = file.name.split(".").pop() || "pdf";
  const storagePath = `${auth.user.id}/${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Upload to Supabase Storage
  const { error: uploadError } = await supabaseAdmin.storage
    .from("resumes")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: "Failed to upload file." }, { status: 500 });
  }

  const { data: urlData } = supabaseAdmin.storage
    .from("resumes")
    .getPublicUrl(storagePath);

  // Basic text extraction for parsing
  let parsedText = "";
  if (file.type === "text/plain") {
    parsedText = new TextDecoder().decode(buffer);
  }

  // Save document record
  const { data: doc, error: docError } = await supabaseAdmin
    .from("job_seeker_documents")
    .insert({
      job_seeker_id: auth.user.id,
      doc_type: "resume",
      file_name: file.name,
      file_url: urlData.publicUrl,
      parsed_data: parsedText ? { raw_text: parsedText } : null,
    })
    .select()
    .single();

  if (docError) {
    return NextResponse.json({ error: "Failed to save document record." }, { status: 500 });
  }

  return NextResponse.json({
    document: doc,
    parsed_text: parsedText || null,
  }, { status: 201 });
}
