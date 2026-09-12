#!/usr/bin/env python3
"""
Apply migration 027 to seed the Garco document.
"""
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_dotenv(path):
    env = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return env

ENV = load_dotenv(os.path.join(REPO, ".env"))
ENV.update({k: v for k, v in os.environ.items() if v})

PG_USER = ENV.get("POSTGRES_USER", "postgres")
PG_DB = ENV.get("POSTGRES_DB", "whatsapp_sales")

def psql(sql):
    cmd = [
        "docker", "compose", "exec", "-T", "postgres", "psql",
        "-U", PG_USER, "-d", PG_DB,
        "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A"
    ]
    proc = subprocess.run(cmd, input=sql, text=True, capture_output=True)
    return proc.stdout, proc.returncode, proc.stderr

def main():
    print("Applying migration 027: Garco Business Directory...")
    
    # Insert document if not exists
    sql = """
    INSERT INTO knowledge_documents (title, document_type, source, language, status, metadata)
    SELECT 'Garco Business Directory', 'markdown', 'https://www.garcoconstruction.com/', 'en', 'indexed', 
           jsonb_build_array('authoritative', 'pricing_reference', 'service_catalog', 'contact_info')
    WHERE NOT EXISTS (SELECT 1 FROM knowledge_documents WHERE title = 'Garco Business Directory');
    """
    out, code, err = psql(sql)
    if code != 0:
        print(f"ERROR inserting document: {err}")
        return 1
    
    # Get the document ID
    sql = "SELECT id FROM knowledge_documents WHERE title = 'Garco Business Directory';"
    out, code, err = psql(sql)
    if code != 0:
        print(f"ERROR getting document ID: {err}")
        return 1
    
    doc_id = out.strip()
    print(f"Document ID: {doc_id}")
    
    # Insert knowledge chunks
    chunks = [
        ("Company Identity", "Garco Construction Services Limited is a general contractor and construction management company established in 1999. It has in-house design-build capabilities and its team includes architects, engineers, CAD technicians, and project managers."),
        ("Services", "Garco performs residential and commercial construction with expertise in concrete work, steel erection, carpentry, and offers design-build projects, general contracting, construction management, consulting, and all construction phases."),
        ("Consultation", "Garco offers a General Construction Consultation. For specific service pricing including roofing, electrical, plumbing, or other works, customers should contact Garco directly for a customized quote."),
        ("Quotation", "For construction services including general construction, renovation, project management, roofing, electrical, plumbing, painting, and more, customers should contact Garco for a customized quote based on project scope."),
        ("Contact", "Founder & CEO: Mr. Rohan A. Grant. Contact: Tel 876-908-1970, Fax 876-754-0469, Mobile 876-372-3358, Website https://www.garcoconstruction.com/"),
        ("Location", "Garco has two possible office addresses (conflicting): Suite 24F, 4 Lismore Avenue, Kingston 5 or Suite 406, Real Equity Professional Suites, 218 Mountain View Avenue, Kingston 6. Connect customers to confirm."),
        ("Services List", "Garco services include: General Construction/Renovation, Project Management, General Roof Works, Dry Wall Partitions & Ceilings, Suspended Ceilings, Trowel-On Works, Textured Spraying, General Painting Works, Electrical Works, Plumbing Works, A/C Works, General Grille & Iron Works."),
        ("Values", "Garco values: Quality, Innovation, Foresight, Integrity, Quantifiable performance. Maintains professionalism, honesty, and fairness."),
        ("AI Rules", "AI MUST NOT invent prices, business hours, services, employees, project details, completion dates, warranties, payment policies, financing options, appointment availability, or office addresses."),
        ("Quotation Rules", "If customer asks for quote: use quotation workflow. Do not invent pricing. Never invent service prices or hourly rates."),
    ]
    
    for i, (section, text) in enumerate(chunks, 1):
        sql = f"""
        INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
        VALUES ('{doc_id}', {i}, '{text}', 'text-embedding-3-small', jsonb_build_object('section', '{section}', 'authoritative', true))
        ON CONFLICT (document_id, chunk_number) DO NOTHING;
        """
        out, code, err = psql(sql)
        if code != 0:
            print(f"ERROR inserting chunk {i}: {err}")
            return 1
        print(f"  Inserted chunk {i}: {section}")
    
    print("Migration 027 applied successfully!")
    return 0

if __name__ == "__main__":
    sys.exit(main())