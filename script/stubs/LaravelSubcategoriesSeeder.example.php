<?php

/**
 * Ejemplo para Laravel (IDs de categoría deben coincidir con tu tabla `categories`).
 * Este proyecto usa Firestore: ejecuta `npm run seed:subcategories` en store.
 *
 * Man Go unificado: todas las subcategorías de oficios/mantenimiento van bajo `technical`
 * (no uses categoría `maintenance`, retirada del catálogo).
 *
 * php artisan db:seed --class=SubcategoriesFromStoreSeeder
 */

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class SubcategoriesFromStoreSeeder extends Seeder
{
    public function run(): void
    {
        // Ajusta IDs tras seed:categories (technical = Man Go, professional = Pro Go, transport = Car Go).
        $technicalId = 1;
        $professionalId = 2;
        $transportId = 3;

        $rows = [
            // Pro Go
            ['slug' => 'legal', 'name' => 'Servicios Legales', 'category_id' => $professionalId, 'icon' => 'Scale'],
            ['slug' => 'financial', 'name' => 'Consultoría Financiera', 'category_id' => $professionalId, 'icon' => 'TrendingUp'],
            ['slug' => 'tutoring', 'name' => 'Tutorías', 'category_id' => $professionalId, 'icon' => 'GraduationCap'],
            // Man Go (technical)
            ['slug' => 'plumbing', 'name' => 'Plomería', 'category_id' => $technicalId, 'icon' => 'Droplets'],
            ['slug' => 'electrical', 'name' => 'Electricidad', 'category_id' => $technicalId, 'icon' => 'Zap'],
            ['slug' => 'appliances', 'name' => 'Reparación de Electrodomésticos', 'category_id' => $technicalId, 'icon' => 'Microwave'],
            ['slug' => 'locksmith', 'name' => 'Cerrajería', 'category_id' => $technicalId, 'icon' => 'KeyRound'],
            ['slug' => 'computing', 'name' => 'Computación / Electrónica', 'category_id' => $technicalId, 'icon' => 'Cpu'],
            ['slug' => 'cleaning', 'name' => 'Limpieza', 'category_id' => $technicalId, 'icon' => 'Sparkles'],
            ['slug' => 'ac_maintenance', 'name' => 'Mantenimiento de Aires Acondicionados', 'category_id' => $technicalId, 'icon' => 'Wind'],
            ['slug' => 'gardening', 'name' => 'Jardinería', 'category_id' => $technicalId, 'icon' => 'Trees'],
            ['slug' => 'painting', 'name' => 'Pintura', 'category_id' => $technicalId, 'icon' => 'Paintbrush'],
            // Car Go (transport)
            ['slug' => 'moto', 'name' => 'Moto', 'category_id' => $transportId, 'icon' => 'Bike'],
            ['slug' => 'auto', 'name' => 'Auto', 'category_id' => $transportId, 'icon' => 'Car'],
            ['slug' => 'camioneta', 'name' => 'Camioneta', 'category_id' => $transportId, 'icon' => 'Truck'],
            ['slug' => 'truck', 'name' => 'Camión', 'category_id' => $transportId, 'icon' => 'Construction'],
        ];

        foreach ($rows as $row) {
            DB::table('sub_categories')->updateOrInsert(
                ['slug' => $row['slug']],
                array_merge($row, ['updated_at' => now(), 'created_at' => now()])
            );
        }
    }
}
