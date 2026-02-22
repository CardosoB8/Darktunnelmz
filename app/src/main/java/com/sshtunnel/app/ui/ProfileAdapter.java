package com.sshtunnel.app.ui;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.sshtunnel.app.R;
import com.sshtunnel.app.model.Profile;

import java.util.ArrayList;
import java.util.List;

/**
 * RecyclerView Adapter for profiles
 */
public class ProfileAdapter extends RecyclerView.Adapter<ProfileAdapter.ProfileViewHolder> {
    
    private List<Profile> profiles = new ArrayList<>();
    private OnProfileClickListener listener;
    
    public interface OnProfileClickListener {
        void onProfileClick(Profile profile);
        void onProfileLoad(Profile profile);
        void onProfileConnect(Profile profile);
    }
    
    public ProfileAdapter(OnProfileClickListener listener) {
        this.listener = listener;
    }
    
    public void setProfiles(List<Profile> profiles) {
        this.profiles = profiles;
        notifyDataSetChanged();
    }
    
    @NonNull
    @Override
    public ProfileViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_profile, parent, false);
        return new ProfileViewHolder(view);
    }
    
    @Override
    public void onBindViewHolder(@NonNull ProfileViewHolder holder, int position) {
        Profile profile = profiles.get(position);
        holder.bind(profile);
    }
    
    @Override
    public int getItemCount() {
        return profiles.size();
    }
    
    class ProfileViewHolder extends RecyclerView.ViewHolder {
        
        private TextView tvProfileName;
        private TextView tvProfileDetails;
        private ImageButton btnMore;
        private Button btnLoad;
        private Button btnConnect;
        
        public ProfileViewHolder(@NonNull View itemView) {
            super(itemView);
            
            tvProfileName = itemView.findViewById(R.id.tvProfileName);
            tvProfileDetails = itemView.findViewById(R.id.tvProfileDetails);
            btnMore = itemView.findViewById(R.id.btnMore);
            btnLoad = itemView.findViewById(R.id.btnLoad);
            btnConnect = itemView.findViewById(R.id.btnConnect);
        }
        
        public void bind(Profile profile) {
            tvProfileName.setText(profile.getName());
            tvProfileDetails.setText(profile.getDisplayInfo());
            
            // More options click
            btnMore.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onProfileClick(profile);
                }
            });
            
            // Load button click
            btnLoad.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onProfileLoad(profile);
                }
            });
            
            // Connect button click
            btnConnect.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onProfileConnect(profile);
                }
            });
            
            // Item click
            itemView.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onProfileClick(profile);
                }
            });
        }
    }
}
