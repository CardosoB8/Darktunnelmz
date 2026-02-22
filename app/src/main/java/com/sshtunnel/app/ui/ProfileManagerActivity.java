package com.sshtunnel.app.ui;

import android.content.Intent;
import android.os.Bundle;
import android.view.MenuItem;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.floatingactionbutton.FloatingActionButton;
import com.sshtunnel.app.R;
import com.sshtunnel.app.model.Profile;
import com.sshtunnel.app.utils.ProfileManager;

import java.util.List;

/**
 * Activity for managing saved profiles
 */
public class ProfileManagerActivity extends AppCompatActivity implements ProfileAdapter.OnProfileClickListener {
    
    private RecyclerView recyclerViewProfiles;
    private LinearLayout emptyState;
    private FloatingActionButton fabAddProfile;
    private Button btnCreateFirstProfile;
    
    private ProfileAdapter adapter;
    private ProfileManager profileManager;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_profile_manager);
        
        // Setup toolbar
        Toolbar toolbar = findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
        }
        
        // Initialize ProfileManager
        profileManager = ProfileManager.getInstance(this);
        
        // Bind views
        bindViews();
        
        // Setup RecyclerView
        setupRecyclerView();
        
        // Setup listeners
        setupListeners();
        
        // Load profiles
        loadProfiles();
    }
    
    @Override
    protected void onResume() {
        super.onResume();
        loadProfiles();
    }
    
    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == android.R.id.home) {
            finish();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }
    
    private void bindViews() {
        recyclerViewProfiles = findViewById(R.id.recyclerViewProfiles);
        emptyState = findViewById(R.id.emptyState);
        fabAddProfile = findViewById(R.id.fabAddProfile);
        btnCreateFirstProfile = findViewById(R.id.btnCreateFirstProfile);
    }
    
    private void setupRecyclerView() {
        recyclerViewProfiles.setLayoutManager(new LinearLayoutManager(this));
        adapter = new ProfileAdapter(this);
        recyclerViewProfiles.setAdapter(adapter);
    }
    
    private void setupListeners() {
        fabAddProfile.setOnClickListener(v -> {
            // Return to main activity to create new profile
            finish();
        });
        
        btnCreateFirstProfile.setOnClickListener(v -> {
            finish();
        });
    }
    
    private void loadProfiles() {
        List<Profile> profiles = profileManager.getProfiles();
        
        if (profiles.isEmpty()) {
            recyclerViewProfiles.setVisibility(View.GONE);
            emptyState.setVisibility(View.VISIBLE);
        } else {
            recyclerViewProfiles.setVisibility(View.VISIBLE);
            emptyState.setVisibility(View.GONE);
            adapter.setProfiles(profiles);
        }
    }
    
    @Override
    public void onProfileClick(Profile profile) {
        // Show options dialog
        String[] options = {"Carregar", "Editar", "Duplicar", "Excluir"};
        
        new AlertDialog.Builder(this)
                .setTitle(profile.getName())
                .setItems(options, (dialog, which) -> {
                    switch (which) {
                        case 0: // Load
                            loadProfile(profile);
                            break;
                        case 1: // Edit
                            editProfile(profile);
                            break;
                        case 2: // Duplicate
                            duplicateProfile(profile);
                            break;
                        case 3: // Delete
                            confirmDelete(profile);
                            break;
                    }
                })
                .show();
    }
    
    @Override
    public void onProfileLoad(Profile profile) {
        loadProfile(profile);
    }
    
    @Override
    public void onProfileConnect(Profile profile) {
        loadProfile(profile);
        finish();
    }
    
    private void loadProfile(Profile profile) {
        Intent resultIntent = new Intent();
        resultIntent.putExtra("profile", profile);
        setResult(RESULT_OK, resultIntent);
        finish();
    }
    
    private void editProfile(Profile profile) {
        // For now, just load it to main activity
        loadProfile(profile);
    }
    
    private void duplicateProfile(Profile profile) {
        if (profileManager.duplicateProfile(profile.getId())) {
            Toast.makeText(this, "Perfil duplicado", Toast.LENGTH_SHORT).show();
            loadProfiles();
        } else {
            Toast.makeText(this, "Erro ao duplicar perfil", Toast.LENGTH_SHORT).show();
        }
    }
    
    private void confirmDelete(Profile profile) {
        new AlertDialog.Builder(this)
                .setTitle(R.string.confirm_delete)
                .setMessage("Deseja excluir o perfil \"" + profile.getName() + "\"?")
                .setPositiveButton("Excluir", (dialog, which) -> {
                    if (profileManager.deleteProfile(profile.getId())) {
                        Toast.makeText(this, R.string.msg_profile_deleted, Toast.LENGTH_SHORT).show();
                        loadProfiles();
                    } else {
                        Toast.makeText(this, "Erro ao excluir perfil", Toast.LENGTH_SHORT).show();
                    }
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }
}
