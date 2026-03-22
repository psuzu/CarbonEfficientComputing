import os
import time
from pathlib import Path
from supabase import create_client, Client
from dotenv import load_dotenv

# Import your actual math from Layer 2!
from estimator import calculate_job_emissions 
from generate_workload import Job
# from carbonsignal import load_carbon_signal # Import whatever you use to load the 48h array

PROJECT_ROOT = Path(__file__).resolve().parent
load_dotenv(PROJECT_ROOT / 'frontend' / '.env.local')

url: str = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
key: str = (os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or "").strip()
supabase: Client = create_client(url, key)

print("🚀 Starting Carbon-Aware Scheduling Worker...")

# Load your 48h carbon signal array once here
# carbon_signal = load_carbon_signal()

while True:
    try:
        # 1. Look for any jobs that the Vercel website just submitted
        response = supabase.table('jobs').select('*').eq('status', 'QUEUED').execute()
        jobs_to_process = response.data

        for db_job in jobs_to_process:
            print(f"Processing Job #{db_job['job_id']} from {db_job['submitter_name']}...")
            
            # 2. Convert the database row into your Python Job object
            # (Adjust these fields to match exactly what your estimator expects)
            python_job = Job(
                job_id=db_job['job_id'],
                submit_hour=db_job['submit_hour'],
                requested_cpus=db_job['requested_cpus'],
                runtime_hours=db_job['runtime_hours'],
                flexibility_class=db_job['flexibility_class']
            )

            # 3. RUN YOUR REAL MATH HERE!
            # Example:
            # baseline_co2 = calculate_job_emissions(python_job, python_job.submit_hour, carbon_signal)
            # best_window = evaluate_best_window(python_job, carbon_signal)
            # optimized_co2 = best_window # Get the lowest emissions
            # scheduled_hour = best_window
            
            # For testing the connection, let's just use placeholder math:
            baseline_co2 = python_job.requested_cpus * python_job.runtime_hours * 150
            optimized_co2 = baseline_co2 * 0.5 
            scheduled_hour = python_job.submit_hour + 2

            # 4. Push the real stats back up to the live database!
            supabase.table('jobs').update({
                'status': 'SCHEDULED',
                'scheduled_start': scheduled_hour,
                'carbon_baseline': baseline_co2,
                'carbon_optimized': optimized_co2
            }).eq('id', db_job['id']).execute()
            
            print(f"✅ Job #{db_job['job_id']} scheduled successfully!")

    except Exception as e:
        print(f"Error checking queue: {e}")

    # Wait 5 seconds before checking the database again
    time.sleep(5)
