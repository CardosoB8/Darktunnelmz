# DarkTunnel VPN - CMake Configuration
# =====================================
# Native code configuration for VPN protocols
#
# TODO: Add native library implementations for:
# - WireGuard (using wireguard-android)
# - OpenVPN (using ics-openvpn)
# - Custom tunnel implementations

cmake_minimum_required(VERSION 3.22.1)

project("darktunnel")

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Compiler flags
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -O2 -fPIC")
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O2 -fPIC")

# Include directories
include_directories(
    ${CMAKE_SOURCE_DIR}/include
)

# ==================== SOURCE FILES ====================

# Native VPN tunnel implementation (placeholder)
set(NATIVE_SOURCES
    # TODO: Add native source files
    # native-vpn.c
    # packet-handler.c
    # crypto-utils.c
)

# ==================== LIBRARIES ====================

# Main native library
add_library(
    darktunnel-native
    SHARED
    ${NATIVE_SOURCES}
)

# Find required libraries
find_library(
    log-lib
    log
)

# Link libraries
target_link_libraries(
    darktunnel-native
    ${log-lib}
)

# ==================== WIREGUARD ====================
# TODO: Integrate WireGuard native library
# Option 1: Use wireguard-android AAR (recommended)
# Option 2: Build from source
#
# include(external/wireguard/CMakeLists.txt)

# ==================== OPENVPN ====================
# TODO: Integrate OpenVPN native library
# Use ics-openvpn library (AAR)
#
# include(external/ics-openvpn/CMakeLists.txt)

# ==================== TESTING ====================

# Enable testing
enable_testing()

# Test executable (placeholder)
# add_executable(darktunnel-test test/main.c)
# target_link_libraries(darktunnel-test darktunnel-native)

# ==================== INSTALL ====================

# Install targets
install(TARGETS darktunnel-native
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
    RUNTIME DESTINATION bin
)
