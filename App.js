// App.js — CalcLab Mobile (Shipaton Edition)
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

import { ProProvider } from './src/context/ProContext';
import { COLORS } from './src/constants/theme';
import HomeScreen from './src/screens/HomeScreen';
import SolverScreen from './src/screens/SolverScreen';
import GraphScreen from './src/screens/GraphScreen';
import PaywallScreen from './src/screens/PaywallScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS = {
  Home: ['home-outline', 'home'],
  Solver: ['calculator-outline', 'calculator'],
  Graph: ['analytics-outline', 'analytics'],
  Pro: ['sparkles-outline', 'sparkles'],
};

function TabIcon({ label, focused }) {
  const icon = TAB_ICONS[label] || ['ellipse-outline', 'ellipse'];
  return (
    <Ionicons
      name={focused ? icon[1] : icon[0]}
      size={21}
      color={focused ? COLORS.primary : COLORS.textDim}
    />
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(5,10,24,0.98)',
          borderTopColor: 'rgba(255,255,255,0.08)',
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 58,
        },
        sceneContainerStyle: { backgroundColor: COLORS.bg },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textDim,
        tabBarLabelStyle: { fontSize: 10, letterSpacing: 0, marginTop: -2, fontWeight: '700' },
        tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
      })}
    >
      <Tab.Screen name="Home"   component={HomeScreen}    />
      <Tab.Screen name="Solver" component={SolverScreen}  />
      <Tab.Screen name="Graph"  component={GraphScreen}   options={{ tabBarLabel: 'Graph' }} />
      <Tab.Screen name="Pro"    component={PaywallScreen} options={{ tabBarLabel: 'Demo' }} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ProProvider>
          <NavigationContainer>
            <StatusBar style="light" />
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Main" component={MainTabs} />
              <Stack.Screen
                name="Paywall"
                component={PaywallScreen}
                options={{ presentation: 'modal', gestureEnabled: true }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </ProProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
