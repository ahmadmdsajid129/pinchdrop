use std::env;

#[path = "../src/license.rs"]
mod license;

use license::{LicenseManager, LicenseTier};

#[test]
fn test_license_lifecycle_and_persistence() {
    let tmp_dir = env::temp_dir().join(format!(
        "pinchdrop_test_lic_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    ));

    // 1. Initial State: Free
    let mut manager = LicenseManager::new(tmp_dir.clone());
    let info = manager.get_info();
    assert!(!info.is_pro);
    assert_eq!(info.tier, LicenseTier::Free);

    // 2. Reject Invalid Key
    let invalid_result = manager.activate("GARBAGE-KEY");
    assert!(invalid_result.is_err());
    assert!(!manager.get_info().is_pro);

    // 3. Activate Lifetime Pro
    let lifetime_result = manager.activate("PDROP-PRO-LIFETIME-DEMO-2026");
    assert!(lifetime_result.is_ok());
    let info = lifetime_result.unwrap();
    assert!(info.is_pro);
    assert_eq!(info.tier, LicenseTier::ProLifetime);
    assert!(info.pro_features.contains(&"two_hand_lasso_select".to_string()));
    assert!(info.pro_features.contains(&"unlimited_paired_devices".to_string()));

    // 4. Persistence Test (Reload from disk)
    let reloaded_manager = LicenseManager::new(tmp_dir.clone());
    let reloaded_info = reloaded_manager.get_info();
    assert!(reloaded_info.is_pro);
    assert_eq!(reloaded_info.tier, LicenseTier::ProLifetime);

    // 5. Deactivation
    let deactivate_result = manager.deactivate();
    assert!(deactivate_result.is_ok());
    assert!(!manager.get_info().is_pro);
}
