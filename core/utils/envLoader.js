import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

// Flag untuk memastikan env hanya di-load sekali
let envLoaded = false;
let envLoadedFrom = null;

/**
 * Load environment variables dengan prioritas:
 * 1. ENV_FILE environment variable (jika di-set) - isi file untuk key yang belum ada di process.env
 * 2. .env.{NODE_ENV} jika NODE_ENV di-set (misal: .env.development, .env.production)
 * 3. .env.dev jika NODE_ENV=development
 * 4. .env sebagai fallback
 * 
 * CATATAN PENTING:
 * - Jika ENV_FILE di-set, file di-load dengan override: false agar variabel yang sudah
 *   di-set oleh Docker Compose (`environment:`) tidak ditimpa oleh isi file (mis. port host 5434 vs 5432 di jaringan container).
 * - Untuk fallback tanpa ENV_FILE, perilaku sama: tidak override vars yang sudah ada.
 * 
 * @param {Object} options - Options untuk dotenv.config()
 * @returns {Object} Result dari dotenv.config()
 */
export function loadEnv(options = {}) {
  const { override: defaultOverride = false, ...restOptions } = options;
  
  // Prioritas 1: ENV_FILE variable (dari Docker atau manual); dotenv override: false (lihat docstring)
  if (process.env.ENV_FILE) {
    const envPath = join(projectRoot, process.env.ENV_FILE);
    console.log(`[envLoader] ENV_FILE is set to: ${process.env.ENV_FILE}`);
    console.log(`[envLoader] Looking for env file at: ${envPath}`);
    console.log(`[envLoader] File exists: ${existsSync(envPath)}`);
    
    if (existsSync(envPath)) {
      // Simpan beberapa env vars sebelum override untuk comparison
      const jwtSecretBefore = process.env.JWT_SECRET;
      const nodeEnvBefore = process.env.NODE_ENV;
      const portBefore = process.env.PORT;
      
      // Baca file .env.dev secara langsung untuk memastikan kita load yang benar
      const fileContent = readFileSync(envPath, 'utf8');
      const lines = fileContent.split('\n');
      const jwtSecretInFile = lines.find(line => line.trim().startsWith('JWT_SECRET='));
      
      console.log(`[envLoader] JWT_SECRET in ${process.env.ENV_FILE} file: ${jwtSecretInFile ? jwtSecretInFile.substring(0, 30) + '...' : 'NOT FOUND'}`);
      console.log(`[envLoader] JWT_SECRET before load: ${jwtSecretBefore ? jwtSecretBefore.substring(0, 20) + '...' : 'NOT SET'}`);
      
      const result = dotenv.config({ 
        path: envPath, 
        override: false,
        ...restOptions 
      });
      
      // Log untuk debugging
      const jwtSecretAfter = process.env.JWT_SECRET;
      const nodeEnvAfter = process.env.NODE_ENV;
      const portAfter = process.env.PORT;
      
      console.log(`[envLoader] ✓ Successfully loaded env file: ${process.env.ENV_FILE} (override: false, existing process.env wins)`);
      console.log(`[envLoader] NODE_ENV: ${nodeEnvBefore} → ${nodeEnvAfter}`);
      console.log(`[envLoader] PORT: ${portBefore} → ${portAfter}`);
      console.log(`[envLoader] JWT_SECRET after load: ${jwtSecretAfter ? jwtSecretAfter.substring(0, 20) + '...' : 'NOT SET'}`);
      console.log(`[envLoader] JWT_SECRET changed: ${jwtSecretBefore !== jwtSecretAfter ? 'YES ✓' : 'NO ✗'}`);
      
      if (result.error) {
        console.error(`[envLoader] Error loading env file: ${result.error.message}`);
      }
      
      if (result.parsed) {
        console.log(`[envLoader] Loaded ${Object.keys(result.parsed).length} variables from ${process.env.ENV_FILE}`);
      }
      
      return result;
    } else {
      console.error(`[envLoader] ✗ ENV_FILE specified (${process.env.ENV_FILE}) but file not found: ${envPath}`);
      console.error(`[envLoader] Project root: ${projectRoot}`);
    }
  }
  
  // Prioritas 2: .env.{NODE_ENV} jika NODE_ENV di-set
  if (process.env.NODE_ENV) {
    const envPath = join(projectRoot, `.env.${process.env.NODE_ENV}`);
    if (existsSync(envPath)) {
      return dotenv.config({ 
        path: envPath, 
        override: defaultOverride,
        ...restOptions 
      });
    }
  }
  
  // Prioritas 3: .env.dev untuk development (backward compatibility)
  if (process.env.NODE_ENV === 'development') {
    const envDevPath = join(projectRoot, '.env.dev');
    if (existsSync(envDevPath)) {
      return dotenv.config({ 
        path: envDevPath, 
        override: defaultOverride,
        ...restOptions 
      });
    }
  }
  
  // Prioritas 4: .env sebagai fallback
  const envPath = join(projectRoot, '.env');
  if (existsSync(envPath)) {
    return dotenv.config({ 
      path: envPath, 
      override: defaultOverride,
      ...restOptions 
    });
  }
  
  // Jika tidak ada file env sama sekali, return empty result
  return { parsed: {}, error: null };
}

/**
 * Load environment variables (default: tidak override env vars yang sudah di-set)
 * Ini adalah wrapper yang memanggil loadEnv dengan override: false
 * 
 * PENTING: 
 * - Jika ENV_FILE di-set, kita load file tersebut; override: false menjaga prioritas env proses (mis. dari Docker)
 * - Jika sudah di-load sebelumnya dan ENV_FILE tidak berubah, kita skip untuk efisiensi
 * - Tapi jika ENV_FILE berubah, kita reload untuk memastikan file yang benar digunakan
 */
export function loadEnvSafe() {
  const currentEnvFile = process.env.ENV_FILE || 'auto';
  
  // Jika ENV_FILE di-set, kita HARUS selalu load untuk memastikan file yang benar digunakan
  // Ini penting untuk memastikan bahwa file yang ditentukan (misal .env.dev) digunakan,
  // bukan file lain yang mungkin sudah ter-load dari Docker env_file atau sumber lain
  if (process.env.ENV_FILE) {
    // Force reload jika ENV_FILE di-set, bahkan jika sudah di-load sebelumnya
    // Ini memastikan bahwa file yang ditentukan benar-benar digunakan
    const result = loadEnv({ override: false });
    envLoaded = true;
    envLoadedFrom = currentEnvFile;
    return result;
  }
  
  // Jika sudah di-load sebelumnya dan ENV_FILE tidak di-set, skip
  if (envLoaded && envLoadedFrom === currentEnvFile) {
    return { parsed: {}, error: null };
  }
  
  const result = loadEnv({ override: false });
  envLoaded = true;
  envLoadedFrom = currentEnvFile;
  
  return result;
}

