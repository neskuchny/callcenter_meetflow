def convert_to_seconds(time_str):
    """Convert mm.ss format to total seconds"""
    try:
        minutes, seconds = map(float, time_str.split('.'))
        return minutes * 60 + seconds
    except:
        return None

def convert_to_mmss(seconds):
    """Convert total seconds back to mm.ss format"""
    minutes = int(seconds // 60)
    remaining_seconds = seconds % 60
    return f"{minutes:02d}.{int(remaining_seconds):02d}"

def clean_file(input_filename, output_filename='cleaned_time_stamp.txt'):
    with open(input_filename, 'r') as infile, open(output_filename, 'w') as outfile:
        # Записываем только непустые строки
        outfile.writelines(line for line in infile if line.strip())
    return output_filename

def analyze_timestamps(filename):
    # Сначала очищаем файл
    clean_filename = clean_file(filename)
    
    # Read all timestamps
    times = []
    with open(clean_filename, 'r') as f:
        for line in f:
            time_str = line.strip()
            seconds = convert_to_seconds(time_str)
            if seconds is not None:
                times.append(seconds)
    
    if not times:
        return {
            'mean': "00.00",
            'mean_seconds': 0,
            'median': "00.00",
            'median_seconds': 0,
            'min': "00.00",
            'max': "00.00",
            'sum': "00.00",
            'total_entries': 0,
            'error': "No valid timestamps found"
        }
    
    # Calculate sum and mean
    total_seconds = sum(times)
    mean_seconds = total_seconds / len(times)
    mean_mmss = convert_to_mmss(mean_seconds)
    
    # Calculate median
    times.sort()
    mid = len(times) // 2
    if len(times) % 2 == 0:
        median_seconds = (times[mid-1] + times[mid]) / 2
    else:
        median_seconds = times[mid]
    median_mmss = convert_to_mmss(median_seconds)
    
    # Get min and max
    min_seconds = min(times)
    max_seconds = max(times)
    
    return {
        'mean': mean_mmss,
        'mean_seconds': mean_seconds,
        'median': median_mmss,
        'median_seconds': median_seconds,
        'min': convert_to_mmss(min_seconds),
        'max': convert_to_mmss(max_seconds),
        'sum': convert_to_mmss(total_seconds),
        'total_entries': len(times)
    }

# Run analysis
results = analyze_timestamps('time_stamp.txt')
print(f"Mean time: {results['mean']} (mm.ss)")
print(f"Median time: {results['median']} (mm.ss)")
print(f"Shortest time: {results['min']} (mm.ss)")
print(f"Longest time: {results['max']} (mm.ss)")
print(f"Total time: {results['sum']} (mm.ss)")
print(f"Total entries analyzed: {results['total_entries']}")
